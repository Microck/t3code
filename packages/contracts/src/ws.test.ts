import { describe, expect, it } from "vitest";

import {
  WS_CLOSE_CODES,
  WS_CLOSE_REASONS,
  WS_EVENT_CHANNELS,
  wsClientMessageSchema,
  wsServerMessageSchema,
} from "./ws";

describe("wsClientMessageSchema", () => {
  it("accepts request messages", () => {
    const parsed = wsClientMessageSchema.parse({
      type: "request",
      id: "req-1",
      method: "providers.startSession",
      params: { provider: "codex" },
    });

    expect(parsed.method).toBe("providers.startSession");
  });
});

describe("wsServerMessageSchema", () => {
  it("accepts successful response messages", () => {
    const parsed = wsServerMessageSchema.parse({
      type: "response",
      id: "req-1",
      ok: true,
      result: { sessionId: "sess-1" },
    });

    expect(parsed.type).toBe("response");
  });

  it("requires errors for failed responses", () => {
    expect(() =>
      wsServerMessageSchema.parse({
        type: "response",
        id: "req-1",
        ok: false,
      }),
    ).toThrow();
  });

  it("accepts typed event channels", () => {
    const parsed = wsServerMessageSchema.parse({
      type: "event",
      channel: WS_EVENT_CHANNELS.providerEvent,
      payload: { id: "evt-1" },
    });

    expect(parsed.type).toBe("event");
  });
});

describe("ws close metadata", () => {
  it("exposes stable unauthorized close semantics", () => {
    expect(WS_CLOSE_CODES.unauthorized).toBe(4001);
    expect(WS_CLOSE_REASONS.unauthorized).toBe("unauthorized");
  });

  it("exposes stable replacement close semantics", () => {
    expect(WS_CLOSE_CODES.replacedByNewClient).toBe(4000);
    expect(WS_CLOSE_REASONS.replacedByNewClient).toBe("replaced-by-new-client");
  });

  it("keeps close codes and reasons unique", () => {
    expect(
      new Set([WS_CLOSE_CODES.unauthorized, WS_CLOSE_CODES.replacedByNewClient]).size,
    ).toBe(2);
    expect(
      new Set([WS_CLOSE_REASONS.unauthorized, WS_CLOSE_REASONS.replacedByNewClient]).size,
    ).toBe(2);
  });
});
