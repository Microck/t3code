// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { runProbe } from "@t3tools/provider-core/server/maintenanceResolver";
import { ompMaintenance, parseOmpUpdateCheck, parseOmpVersion } from "./omp-maintenance.ts";

describe("native OMP update output", () => {
  it("reads the native slash-delimited version", () => {
    expect(parseOmpVersion("omp/18.13.3\r\n")).toBe("18.13.3");
    expect(parseOmpVersion("omp/18.13.3-canary.2\n")).toBe("18.13.3-canary.2");
    expect(parseOmpVersion("unexpected output")).toBeNull();
  });
  it("uses the offered version, including canary suffixes", () => {
    expect(
      parseOmpUpdateCheck("Current version: 18.12.0\nNew version available: 18.13.3-canary.2"),
    ).toBe("18.13.3-canary.2");
  });
  it("recognizes an already current installation", () => {
    expect(parseOmpUpdateCheck("Current version: 18.13.3\nAlready up to date")).toBe("18.13.3");
    expect(parseOmpUpdateCheck("Current version: 18.13.3\r\n✔ Already up to date\r\n")).toBe(
      "18.13.3",
    );
  });
  it("rejects failed checks and malformed offers", () => {
    expect(
      parseOmpUpdateCheck("Current version: 18.12.0\nFailed to check for updates: 500"),
    ).toBeNull();
    expect(parseOmpUpdateCheck("New version available: 18.13.3; malicious")).toBeNull();
  });
});

it.live("checks and updates the configured installation with the same native environment", () =>
  Effect.gen(function* () {
    const platform = yield* HostProcess.Platform;
    const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omp-maintenance-"));
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => NodeFS.rmSync(cwd, { recursive: true, force: true })),
    );
    const executable = NodePath.join(cwd, platform === "win32" ? "omp.cmd" : "omp");
    NodeFS.writeFileSync(
      NodePath.join(cwd, "fixture.cjs"),
      `
const fs = require('node:fs');
const path = require('node:path');
if (process.cwd() !== __dirname || process.env.OMP_UPDATE_TEST !== 'preserved' || process.env.NO_COLOR !== '1' || process.env.PATH.split(path.delimiter)[0] !== __dirname) process.exit(2);
const args = process.argv.slice(2);
if (args.join(' ') === 'update --check') console.log('Current version: 18.12.0\\nNew version available: 18.13.3-canary.2');
else if (args.join(' ') === 'update') fs.writeFileSync('updated.json', JSON.stringify(args));
else process.exit(3);
`,
    );
    NodeFS.writeFileSync(
      executable,
      platform === "win32"
        ? `@"${process.execPath}" "%~dp0fixture.cjs" %*\r\n`
        : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${NodePath.join(cwd, "fixture.cjs").replaceAll("'", "'\\''")}' "$@"\n`,
      { mode: 0o755 },
    );
    const capabilities = yield* ompMaintenance(cwd).resolve({
      binaryPath: executable,
      resolvedCommandPath: executable,
      realCommandPath: executable,
      platform,
      env: { ...process.env, OMP_UPDATE_TEST: "preserved" },
    });
    expect(yield* capabilities.lookupLatestVersion!).toBe("18.13.3-canary.2");
    expect(NodeFS.existsSync(NodePath.join(cwd, "updated.json"))).toBe(false);
    const update = capabilities.update!;
    expect(yield* runProbe(update.executable, update.args, update.env!, [0], update.cwd)).toBe("");
    expect(JSON.parse(NodeFS.readFileSync(NodePath.join(cwd, "updated.json"), "utf8"))).toEqual([
      "update",
    ]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
