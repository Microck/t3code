import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as AcpSchema from "effect-acp/schema";

import { AcpRegistrySettings } from "../settings.ts";
import {
  extractOmpElicitationForm,
  extractOmpSubagentUpdates,
  isOmpAcpCommand,
} from "./omp-acp.ts";

const decodeRequest = Schema.decodeUnknownSync(AcpSchema.CreateElicitationRequest);
const decodeSettings = Schema.decodeSync(AcpRegistrySettings);

const properties = {
  q0: {
    type: "string",
    title: "Which retention policy should be used?",
    description: "Retention",
    oneOf: [
      { const: "Keep", title: "Keep" },
      { const: "Replace", title: "Replace" },
    ],
  },
  q0__other: { type: "string", title: "Other (type your own)" },
  q1: {
    type: "string",
    title: "Which access method should be used?",
    description: "Access",
    oneOf: [{ const: "SSH", title: "SSH" }],
  },
  q1__other: { type: "string", title: "Other (type your own)" },
  q2: {
    type: "array",
    title: "Where should alerts be sent?",
    description: "Alerts",
    items: {
      anyOf: [
        { const: "Email", title: "Email" },
        { const: "Chat", title: "Chat" },
      ],
    },
  },
  q2__other: { type: "string", title: "Other (type your own)" },
};

function request(fields: Record<string, unknown> = properties, required?: string[]) {
  return decodeRequest({
    mode: "form",
    sessionId: "omp-session",
    message: "Answer 3 questions",
    requestedSchema: { type: "object", properties: fields, ...(required ? { required } : {}) },
  });
}

describe("OMP question forms", () => {
  it("shows three logical questions with their original context instead of six fields", () => {
    const form = extractOmpElicitationForm(request())!;
    expect(form.questions.map(({ id, header, question }) => ({ id, header, question }))).toEqual([
      { id: "q0", header: "Retention", question: "Which retention policy should be used?" },
      { id: "q1", header: "Access", question: "Which access method should be used?" },
      { id: "q2", header: "Alerts", question: "Where should alerts be sent?" },
    ]);
    expect(form.questions[2]?.multiSelect).toBe(true);
    expect(form.questions.every((question) => question.required === false)).toBe(true);
    expect(form.questions.every((question) => question.allowCustomAnswer === true)).toBe(true);
  });

  it("returns choices and custom text through OMP's distinct native fields", () => {
    const form = extractOmpElicitationForm(request())!;
    expect(
      form.respond({ q0: "Keep", q1: "  Use a different method  ", q2: ["Email", "Chat"] }),
    ).toEqual({
      action: "accept",
      content: { q0: "Keep", q1__other: "  Use a different method  ", q2: ["Email", "Chat"] },
    });
    expect(form.respond({ q0: "My policy", q2: "Another destination" })).toEqual({
      action: "accept",
      content: { q0__other: "My policy", q2__other: "Another destination" },
    });
  });

  it("preserves required answers and rejects invalid typed selections", () => {
    const form = extractOmpElicitationForm(request(properties, ["q0"]))!;
    expect(form.questions[0]?.required).toBeUndefined();
    expect(form.respond({})).toEqual({ action: "cancel" });
    expect(form.respond({ q0: "" })).toEqual({ action: "cancel" });
    expect(form.respond({ q0: "Keep", q1: ["SSH"] })).toEqual({ action: "cancel" });
    expect(form.respond({ q0: "Keep", q2: ["Unknown"] })).toEqual({ action: "cancel" });
    expect(form.respond({ q0: 1 })).toEqual({ action: "cancel" });
  });

  it("leaves incomplete or unrelated forms to ordinary ACP handling", () => {
    expect(extractOmpElicitationForm(request({ q0: properties.q0 }))).toBeUndefined();
    expect(
      extractOmpElicitationForm(request({ ...properties, extra: { type: "string" } })),
    ).toBeUndefined();
    expect(
      extractOmpElicitationForm(
        request({ ...properties, q0__other: { type: "string", title: "Notes" } }),
      ),
    ).toBeUndefined();
    expect(extractOmpElicitationForm(request(properties, ["q0__other"]))).toBeUndefined();
    expect(
      extractOmpElicitationForm(
        request({ ...properties, q2: { ...properties.q2, minItems: 3, maxItems: 1 } }),
      ),
    ).toBeUndefined();
  });

  it("routes only the configured OMP ACP command, independently of its display name", () => {
    const settings = decodeSettings({
      source: "local",
      commandPath: "/home/ubuntu/.local/bin/omp",
      commandArgs: ["acp", "--config", "/config.yml"],
    });
    expect(isOmpAcpCommand(settings)).toBe(true);
    expect(isOmpAcpCommand({ ...settings, commandPath: "C:\\tools\\omp.cmd" })).toBe(true);
    expect(isOmpAcpCommand({ ...settings, commandPath: "/bin/other" })).toBe(false);
    expect(isOmpAcpCommand({ ...settings, commandArgs: [] })).toBe(false);
    expect(isOmpAcpCommand({ ...settings, source: "registry" })).toBe(false);
  });
});

describe("OMP native subagents", () => {
  const extract = (...args: Parameters<typeof extractOmpSubagentUpdates>) =>
    extractOmpSubagentUpdates(...args).updates;
  it("settles native task updates without requiring another wait", () => {
    for (const state of ["completed", "failed", "cancelled"] as const) {
      const tool = {
        toolCallId: "spawn",
        data: {
          rawOutput: {
            details: {
              async: { state, jobId: "GuiRestored", type: "task" },
              results: [],
            },
          },
        },
      };
      expect(extractOmpSubagentUpdates(tool, "root")).toMatchObject({
        retainTool: true,
        updates: [{ nativeTaskId: "root:omp-job:GuiRestored", status: state, progress: "" }],
      });
      expect(
        extractOmpSubagentUpdates(
          {
            ...tool,
            data: {
              rawOutput: {
                details: {
                  async: { state, jobId: "shell", type: "bash" },
                },
              },
            },
          },
          "root",
        ).updates,
      ).toEqual([]);
    }
  });

  it("keeps batch identities scoped to their root session and maps reported outcomes", () => {
    const jobs = ["Report", "Validate", "Research"].map((id, index) => ({
      id,
      type: "task",
      status: "running",
      label: id,
      completionPercent: index * 25,
      stage: "Reviewing sources",
      resolvedModelIdentity: "anthropic/claude-opus-5-5",
    }));
    const tool = { toolCallId: "wait-1", data: { rawOutput: { details: { op: "wait", jobs } } } };
    const updates = extract(tool, "root-a");
    expect(updates).toHaveLength(3);
    expect(updates.map((task) => task.progress)).toEqual([
      "~0% · Reviewing sources",
      "~25% · Reviewing sources",
      "~50% · Reviewing sources",
    ]);
    expect(new Set(updates.map((task) => task.nativeTaskId)).size).toBe(3);
    const mixed = extract(
      {
        ...tool,
        data: {
          rawOutput: {
            details: { op: "wait", jobs: [...jobs, { ...jobs[0], id: "Shell", type: "bash" }] },
          },
        },
      },
      "root-a",
    );
    expect(mixed).toHaveLength(3);
    expect(mixed.every((task) => task.suppressNormalTool === undefined)).toBe(true);
    expect(extract({ ...tool, toolCallId: "wait-2" }, "root-a")).toEqual(updates);
    expect(extract(tool, "root-b")[0]?.nativeTaskId).not.toBe(updates[0]?.nativeTaskId);
    const settled = extract(
      {
        ...tool,
        data: {
          rawOutput: {
            details: {
              op: "wait",
              jobs: jobs.map((job, index) => ({
                ...job,
                status: ["completed", "failed", "cancelled"][index],
                ...(index === 0 ? { resultText: "Done" } : {}),
                ...(index === 1 ? { errorText: "Failed" } : {}),
              })),
            },
          },
        },
      },
      "root-a",
    );
    expect(settled.map((task) => task.status)).toEqual(["completed", "failed", "cancelled"]);
    expect(settled.map((task) => task.progress)).toEqual(["", "", ""]);
    expect(settled.map((task) => task.result)).toEqual(["Done", "Failed", null]);
    expect(
      extract(
        {
          ...tool,
          data: { rawOutput: { details: { op: "wait", jobs: [{ ...jobs[0], type: "bash" }] } } },
        },
        "root-a",
      ),
    ).toEqual([]);
    expect(
      extract({ ...tool, data: { rawOutput: { details: { progress: jobs } } } }, "root-a"),
    ).toEqual([]);
  });
});
