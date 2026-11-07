import { TrimmedNonEmptyString } from "@t3tools/contracts";
import type { AcpAdapterV2Flavor } from "@t3tools/provider-acp/server/adapter";
import { parseElicitationForm } from "@t3tools/provider-acp/server/elicitationForm";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import type { AcpToolCallState } from "@t3tools/provider-acp/server/runtimeModel";
import type {
  AcpAdapterV2SubagentUpdate,
  AcpAdapterV2SubagentBatch,
} from "@t3tools/provider-acp/server/adapter";

import type { AcpRegistrySettings } from "../settings.ts";

export function isOmpAcpCommand(settings: AcpRegistrySettings): boolean {
  return (
    settings.source === "local" &&
    /^omp(?:\.exe|\.cmd|\.bat)?$/i.test(settings.commandPath.split(/[\\/]/).at(-1) ?? "") &&
    settings.commandArgs[0] === "acp"
  );
}

const isOmpForm = Schema.is(
  Schema.Struct({
    properties: Schema.Record(Schema.String, Schema.Unknown),
    required: Schema.optional(Schema.Array(Schema.String)),
  }),
);
const isChoiceField = Schema.is(
  Schema.Struct({
    type: Schema.Literals(["string", "array"]),
    title: TrimmedNonEmptyString,
    description: Schema.optional(Schema.String),
  }),
);
const isOtherField = Schema.is(
  Schema.Struct({ type: Schema.Literal("string"), title: Schema.Literal("Other (type your own)") }),
);

// OMP's askDialog emits qN and qN__other for one logical question. Keep that
// native wire format at the provider boundary; clients already support custom answers.
export const extractOmpElicitationForm: NonNullable<
  AcpAdapterV2Flavor["extractElicitationForm"]
> = (request) => {
  if (request.mode !== "form" || !isOmpForm(request.requestedSchema)) return undefined;
  const { properties, required = [] } = request.requestedSchema;
  const fields: Record<string, unknown> = {};
  let questionCount = 0;
  for (const [id, field] of Object.entries(properties)) {
    if (!/^q(?:0|[1-9]\d*)$/.test(id)) continue;
    if (!isChoiceField(field) || !isOtherField(properties[`${id}__other`])) return undefined;
    questionCount++;
    // OMP uses the field title for its full question and description for its short header.
    fields[id] = {
      ...field,
      title: field.description?.trim() || `Question ${questionCount}`,
      description: field.title,
    };
  }
  if (
    questionCount === 0 ||
    Object.keys(properties).length !== questionCount * 2 ||
    required.some((id) => !Object.hasOwn(fields, id))
  ) {
    return undefined;
  }
  const parsed = parseElicitationForm(
    { type: "object", properties: fields, required },
    request.message,
  );
  if (parsed === undefined || parsed.questions.some((question) => question.options.length === 0))
    return undefined;
  // The validated OMP companion fields carry custom answers separately from fixed choices.
  const questions = parsed.questions.map((question) => ({ ...question, allowCustomAnswer: true }));

  return {
    questions,
    respond: (answers) => {
      const entries: Array<[string, string | string[]]> = [];
      for (const question of questions) {
        const answer = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
        if (answer === undefined || (typeof answer === "string" && !answer.trim())) {
          if (question.required !== false) return { action: "cancel" };
          continue;
        }
        const isOption = (value: string) =>
          question.options.some((option) => (option.value ?? option.label) === value);
        if (Array.isArray(answer)) {
          if (!question.multiSelect || !answer.every(isOption)) return { action: "cancel" };
          entries.push([question.id, answer]);
        } else if (typeof answer === "string") {
          entries.push([
            !question.multiSelect && isOption(answer) ? question.id : `${question.id}__other`,
            answer,
          ]);
        } else {
          return { action: "cancel" };
        }
      }
      return { action: "accept", content: Object.fromEntries(entries) };
    },
  };
};

const decodeOmpWaitTasks = Schema.decodeUnknownOption(
  Schema.Struct({
    details: Schema.Struct({
      op: Schema.Literal("wait"),
      jobs: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          type: Schema.Literals(["task", "bash", "eval"]),
          status: Schema.Literals(["running", "completed", "failed", "cancelled"]),
          label: Schema.String,
          resolvedModelIdentity: Schema.optionalKey(Schema.String),
          resolvedModel: Schema.optionalKey(Schema.String),
          completionPercent: Schema.optionalKey(
            Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
          ),
          stage: Schema.optionalKey(Schema.String),
          widget: Schema.optionalKey(
            Schema.Struct({ title: Schema.String, stage: Schema.optionalKey(Schema.String) }),
          ),
          resultText: Schema.optionalKey(Schema.String),
          errorText: Schema.optionalKey(Schema.String),
        }),
      ),
    }),
  }),
);

const decodeOmpTaskCompletion = Schema.decodeUnknownOption(
  Schema.Struct({
    details: Schema.Struct({
      async: Schema.Struct({
        type: Schema.Literal("task"),
        jobId: TrimmedNonEmptyString,
        state: Schema.Literals(["completed", "failed", "cancelled"]),
      }),
    }),
  }),
);

// Job ids identify executions; agent handles can be reused by later jobs.
export function extractOmpSubagentUpdates(
  tool: AcpToolCallState,
  sessionId = "",
): AcpAdapterV2SubagentBatch {
  const completion = decodeOmpTaskCompletion(tool.data.rawOutput);
  if (Option.isSome(completion)) {
    const job = completion.value.details.async;
    // Native completion arrives on the original tool, even without another wait.
    return {
      retainTool: true,
      updates: [
        {
          nativeTaskId: `${sessionId}:omp-job:${job.jobId}`,
          childSessionId: null,
          prompt: "",
          title: job.jobId,
          model: null,
          status: job.state,
          progress: "",
          result: null,
        },
      ],
    };
  }
  const decoded = decodeOmpWaitTasks(tool.data.rawOutput);
  if (Option.isNone(decoded)) return { updates: [], retainTool: false };
  const retainTool = decoded.value.details.jobs.some((entry) => entry.type !== "task");
  const updates: ReadonlyArray<AcpAdapterV2SubagentUpdate> = decoded.value.details.jobs
    .filter((job) => job.type === "task")
    .map((job) => ({
      nativeTaskId: `${sessionId}:omp-job:${job.id}`,
      childSessionId: null,
      prompt: job.widget?.title ?? "",
      title: job.label || job.id,
      model: job.resolvedModelIdentity ?? job.resolvedModel ?? null,
      status: job.status,
      progress:
        job.status === "running"
          ? [
              ...(job.completionPercent === undefined
                ? []
                : [`~${Math.round(job.completionPercent)}%`]),
              job.widget?.stage ?? job.stage,
            ]
              .filter(Boolean)
              .join(" · ")
          : "",
      result: job.errorText ?? job.resultText ?? null,
    }));
  return { updates, retainTool };
}
