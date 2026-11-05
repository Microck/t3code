import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import { normalizeLoadResponse } from "./personal-release-load.ts";

const legacy = `  waitForSessionLoadReplayIdle,
  const runLoadSessionWithReplayIdle = (
          const idleFiber = yield* waitForSessionLoadReplayIdle({
            gateRef: sessionLoadGateRef,
          }).pipe(Effect.forkIn(runtimeScope));
          const loaded = yield* Effect.raceFirst(
            acp.agent.loadSession(loadPayload),
            Fiber.join(idleFiber),
          ).pipe(
            Effect.ensuring(Fiber.interrupt(idleFiber).pipe(Effect.ignore)),
                    detail: "session/load timed out waiting for RPC response or replay idle gap",
`;
NodeTest.test("restores response-bound session loading", () => {
  const result = normalizeLoadResponse(legacy);
  NodeAssert.match(result, /yield\* acp\.agent\.loadSession\(loadPayload\)\.pipe/);
  NodeAssert.doesNotMatch(result, /Fiber\.join\(idleFiber\)|waitForSessionLoadReplayIdle/);
  NodeAssert.match(result, /timed out waiting for RPC response"/);
  NodeAssert.equal(normalizeLoadResponse(result), result);
});
NodeTest.test("leaves already-correct runtime alone", () => {
  const current = "const runLoadSession = () => acp.agent.loadSession(loadPayload);";
  NodeAssert.equal(normalizeLoadResponse(current), current);
});
NodeTest.test("rejects unrecognized race shape", () => {
  NodeAssert.throws(() =>
    normalizeLoadResponse(legacy.replace("Fiber.join(idleFiber)", "Fiber.join(otherFiber)")),
  );
  NodeAssert.throws(() =>
    normalizeLoadResponse(legacy.replace("runLoadSessionWithReplayIdle", "runLoadSessionChanged")),
  );
  NodeAssert.throws(() =>
    normalizeLoadResponse(legacy + "\nconst extra = waitForSessionLoadReplayIdle;"),
  );
});
