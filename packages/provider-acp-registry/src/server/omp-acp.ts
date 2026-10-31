import { TrimmedNonEmptyString } from "@t3tools/contracts";
import {
  acpElicitationQuestions,
  type AcpAdapterV2Flavor,
} from "@t3tools/provider-acp/server/adapter";
import * as Schema from "effect/Schema";

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
  const questions = acpElicitationQuestions(fields, request.message, required);
  if (questions.some((question) => question.options.length === 0)) return undefined;

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
