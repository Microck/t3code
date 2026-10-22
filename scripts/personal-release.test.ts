// Exercise the pre-install Node bootstrap with real Git and filesystem operations.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { createBuildSnapshot, officialNightly, personalVersion } from "./personal-release.ts";

describe("personal release selection", () => {
  it("ignores drafts, stable releases and maintainer previews", () => {
    const nightly = { tag_name: "v0.1.2-nightly.20261021.3473", draft: false };
    expect(
      officialNightly([
        { tag_name: "v0.1.2-preview.20261021.9999", draft: false },
        { tag_name: "v0.1.2-nightly.20261021.9998", draft: true },
        { tag_name: "v0.1.2", draft: false },
        nightly,
      ]),
    ).toBe(nightly);
    expect(() => officialNightly([])).toThrow("No official nightly found");
  });

  it("keeps upstream and fork runtimes separate and orders later builds correctly", () => {
    const first = personalVersion("0.1.2-nightly.20261021.3473", 1);
    const rebuild = personalVersion("0.1.2-nightly.20261021.3473", 2);
    const update = personalVersion("0.1.2-nightly.20261021.3474", 3);
    expect(first).toBe("0.1.2-nightly.20261021.347300001");
    expect(BigInt(rebuild.split(".").at(-1)!)).toBeGreaterThan(BigInt(first.split(".").at(-1)!));
    expect(BigInt(update.split(".").at(-1)!)).toBeGreaterThan(BigInt(rebuild.split(".").at(-1)!));
  });

  it.each([0, -1, 1.5, 100_000, Number.NaN])("rejects an invalid run number %s", (run) => {
    expect(() => personalVersion("0.1.2-nightly.20261021.3473", run)).toThrow();
  });

  it.each(["0.1.2", "0.1.2-preview.20261021.3473", "../v0.1.2", "v0.1.2-nightly.20261021.3473"])(
    "rejects a non-nightly or unsafe version %s",
    (version) => expect(() => personalVersion(version, 1)).toThrow(),
  );
});

it("publishes current application source without importing upstream workflow history", () => {
  const fixtureRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-release-snapshot-"));
  const resolvedRoot = NodePath.resolve(fixtureRoot);
  if (
    NodePath.dirname(resolvedRoot) !== NodePath.resolve(NodeOS.tmpdir()) ||
    !NodePath.basename(resolvedRoot).startsWith("t3-release-snapshot-")
  )
    throw new Error("Refusing to remove a directory outside this test's temporary fixture");
  const repoPath = NodePath.join(fixtureRoot, "repo");
  NodeFS.mkdirSync(repoPath);
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim();
  const write = (file: string, contents: string) => {
    const target = NodePath.join(repoPath, file);
    NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
    NodeFS.writeFileSync(target, contents);
  };
  try {
    git("init", "--initial-branch=automation");
    git("config", "user.name", "Microck");
    git("config", "user.email", "contact@micr.dev");
    git("config", "commit.gpgsign", "false");
    const hooks = NodePath.join(fixtureRoot, "hooks");
    NodeFS.mkdirSync(hooks);
    git("config", "core.hooksPath", hooks);
    write(".github/workflows/release.yml", "reviewed release workflow");
    write(".github/workflows/personal.yml", "personal automation");
    write(".github/labels.yml", "old labels");
    write("application.ts", "old application");
    git("add", ".");
    git("commit", "-m", "automation baseline");
    const automationCommit = git("rev-parse", "HEAD");
    write(".github/workflows/release.yml", "upstream workflow changes");
    write(".github/workflows/new.yml", "new upstream workflow");
    NodeFS.unlinkSync(NodePath.join(repoPath, ".github/workflows/personal.yml"));
    write(".github/labels.yml", "current upstream labels");
    write("application.ts", "latest upstream application");
    git("add", ".");
    git("commit", "-m", "upstream nightly");
    write("application.ts", "latest upstream application with personal fix");
    git("add", ".");
    git("commit", "-m", "personal fix");
    const preparedCommit = git("rev-parse", "HEAD");
    const source = createBuildSnapshot({
      repoPath,
      automationCommit,
      upstreamTag: "v0.1.2-nightly.20261022.3512",
    });
    expect(git("show", `${source}:application.ts`)).toBe(
      "latest upstream application with personal fix",
    );
    expect(git("show", `${source}:.github/labels.yml`)).toBe("current upstream labels");
    expect(git("rev-parse", `${source}:.github/workflows`)).toBe(
      git("rev-parse", `${automationCommit}:.github/workflows`),
    );
    expect(git("diff", "--name-only", automationCommit, source, "--", ".github/workflows")).toBe(
      "",
    );
    expect(git("rev-list", source, `^${automationCommit}`)).toBe(source);
    expect(git("rev-parse", `${source}^`)).toBe(automationCommit);
    // Snapshot creation changes no checkout files, branch pointers or index entries.
    expect(git("rev-parse", "HEAD")).toBe(preparedCommit);
    expect(git("status", "--porcelain")).toBe("");
  } finally {
    NodeFS.rmSync(resolvedRoot, { recursive: true, force: true });
  }
});
