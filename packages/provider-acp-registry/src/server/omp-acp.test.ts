import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as AcpSchema from "effect-acp/schema";

import { AcpRegistrySettings } from "../settings.ts";
import { extractOmpElicitationForm, isOmpAcpCommand } from "./omp-acp.ts";

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
