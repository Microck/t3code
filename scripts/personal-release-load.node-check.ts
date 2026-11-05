import * as Assert from "node:assert/strict";
import * as Test from "node:test";
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
Test.test("restores response-bound session loading", () => {
  const result = normalizeLoadResponse(legacy);
  Assert.match(result, /yield\* acp\.agent\.loadSession\(loadPayload\)\.pipe/);
  Assert.doesNotMatch(result, /Fiber\.join\(idleFiber\)|waitForSessionLoadReplayIdle/);
  Assert.match(result, /timed out waiting for RPC response"/);
});
Test.test("leaves already-correct runtime alone", () => {
  const current = "const runLoadSession = () => acp.agent.loadSession(loadPayload);";
  Assert.equal(normalizeLoadResponse(current), current);
});
Test.test("rejects unrecognized race shape", () => {
  Assert.throws(() =>
    normalizeLoadResponse(legacy.replace("Fiber.join(idleFiber)", "Fiber.join(otherFiber)")),
  );
  Assert.throws(() =>
    normalizeLoadResponse(legacy.replace("runLoadSessionWithReplayIdle", "runLoadSessionChanged")),
  );
  Assert.throws(() =>
    normalizeLoadResponse(legacy + "\nconst extra = waitForSessionLoadReplayIdle;"),
  );
});
