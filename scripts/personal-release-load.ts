// Preserve the carried fix: replay silence is not a session/load response.
export function normalizeLoadResponse(source: string): string {
  const marker = "  const runLoadSessionWithReplayIdle = (";
  if (!source.includes(marker)) {
    if (
      source.includes("waitForSessionLoadReplayIdle") ||
      source.includes("runLoadSessionWithReplayIdle")
    )
      throw new Error("Unexpected ACP load compatibility shape");
    return source;
  }
  const before = `          const idleFiber = yield* waitForSessionLoadReplayIdle({
            gateRef: sessionLoadGateRef,
          }).pipe(Effect.forkIn(runtimeScope));
          const loaded = yield* Effect.raceFirst(
            acp.agent.loadSession(loadPayload),
            Fiber.join(idleFiber),
          ).pipe(
            Effect.ensuring(Fiber.interrupt(idleFiber).pipe(Effect.ignore)),`;
  const after = `          // Replay silence does not acknowledge session/load or its configuration.
          const loaded = yield* acp.agent.loadSession(loadPayload).pipe(`;
  const replacements: ReadonlyArray<readonly [string, string]> = [
    ["  waitForSessionLoadReplayIdle,\n", ""],
    [before, after],
    [
      "session/load timed out waiting for RPC response or replay idle gap",
      "session/load timed out waiting for RPC response",
    ],
  ];
  let result = source;
  for (const [from, to] of replacements) {
    if (result.split(from).length !== 2)
      throw new Error(`Unexpected ACP load compatibility shape: ${from}`);
    result = result.replace(from, to);
  }
  if (result.includes("waitForSessionLoadReplayIdle") || result.includes("Fiber.join(idleFiber)"))
    throw new Error("Unexpected ACP load compatibility shape: residual idle race");
  return result;
}
