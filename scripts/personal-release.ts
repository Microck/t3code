// This bootstrap runs before dependency installation, outside the app's Effect runtime.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";

import { normalizeLoadResponse } from "./personal-release-load.ts";

const upstream = "pingdotgg/t3code";
const fork = "Microck/t3code";
const fixes: ReadonlyArray<{
  readonly pr?: number;
  readonly commit: string;
  readonly label?: string;
}> = [
  // This rebased copy preserves upstream's deletion of the obsolete web test.
  { pr: 22466, commit: "f5ae110db9f1914938047009aee7db8d3b62bc66" },
  { pr: 22842, commit: "d050d986b0867656ba4c7390d84eb53076d2c4c6" },
  // Includes the activation-preference prerequisite needed for one resume after Stop.
  { pr: 21439, commit: "66710506e8f4c710d0a6762a25da4c8fcdae0c49" },
  { pr: 21323, commit: "60250740480898e75cb5cd75630fe38faedd2f4d" },
  { pr: 22698, commit: "4a94f79b205d724d29e75dcebf571180c94bf36e" },
  { pr: 20363, commit: "a6a2b2ae7a4c433d1cba3aaba48ab6a0a70bc296" },
  { pr: 21066, commit: "3dc6f65b586484d14b9eb94aef6b8eb60e5bef03" },
  { pr: 21770, commit: "669a88a2f2f15692ec2fdb9a70b0f12b23991d86" },
  { pr: 21801, commit: "4ec8ea9941de082bf30847e4f4b6237f63229f5c" },
  { pr: 22972, commit: "c18c9f96e647283691d00ee3b05c96734f5d97de" },
  { pr: 26403, commit: "0a0f9e069605a862fb4db486e7a81a916b1b3691" },
  {
    commit: "ef97de218b54c8832a894b80b3e2839ee7391210",
    label: "OMP choices and custom answers in one question step",
  },
  {
    commit: "693dd6efd581f6088c0947ea7d103bdc3ae063f6",
    label: "Native OMP task progress on web, desktop and mobile",
  },
  {
    commit: "89fdbbc27330a53d7bc282823f42f33ea2615e62",
    label: "OMP model family logos and reported completion estimates",
  },
  {
    commit: "770abdbdc769a52c85d46c98526e63783b19063f",
    label: "Native OMP wait jobs displayed as subagent status rows",
  },
  {
    commit: "d16a95c2b8b6b1517847f8694f820f0393997598",
    label: "Distribution-aware remote update checks",
  },
  {
    commit: "1fd0fb63740dcfd56db1ad4229d8bfcbf9e97a7e",
  },
  {
    commit: "73c68a967f1882f12513b096d1a84753f6767197",
  },
  {
    pr: 26188,
    commit: "87d2500ab936ef32dde6ec5dc2541d56d94559e5",
    label: "Recover shared Codex sessions after the app-server process exits",
  },
  {
    commit: "6308c020d352238171e788312f8f3429ca3f37ab",
    label: "Package mirror failover on GitHub-hosted runners",
  },
  {
    commit: "8cf8c2c77dd8824c06cc705d78a922b9fdacc35b",
    label: "Discover every advertised ACP command and skill without a count cap",
  },
  {
    commit: "7993d70a0d7ff72ce1bed191744947c2bb1298a8",
    label: "Queue OMP busy rejections until delivery or cancellation",
  },
  {
    commit: "d9f5dafcb8e7c29d3841e2f817ae7cebbde6b99e",
    label: "Keep cancellable OMP busy retries compatible with Effect diagnostics",
  },
  {
    commit: "1542e6e6d9261b4574c9b07f887fb7b769f06c27",
    label: "Reuse upstream's Result import for the OMP busy queue",
  },
  {
    commit: "981ea6c37cfd2856aab0984574b8759ca6dafc8d",
    label: "Keep ACP startup metadata from erasing the model catalog",
  },
  {
    commit: "4d46442548c8c0779660d0a70a96a75c4fa76f43",
    label: "Check and install OMP provider updates through its native updater",
  },
  {
    commit: "f63533fc6d4b4eb396bfa673cf49c6e042aa7dfd",
    label: "Render native ACP image responses inline from durable local artifacts",
  },
  {
    commit: "9bd52ed7c35fa173edd63e244264036ff40ae5bf",
    label: "Show published HTML boards when ACP tool wrappers hide their results",
  },
  // Command-label normalization must not hide the Grok regression test checkpoint.
  { commit: "6e276dd3c685a41d096b52da13902dbefbe6dfbb" },
  {
    commit: "9fdff1d502a7d1158355b8df91f23c686590c7c1",
    label: "Confirm Stop for every owned ACP runtime and client terminal",
  },
  {
    commit: "6f6003453ed310333426c5cb42984a9fb46b48e9",
    label: "Fail waiting foreground tools when native ACP work ends with an error",
  },
  {
    commit: "225b7a3fcb0ce75f96626f4b874f03d60021f71e",
    label: "Wait for acknowledged ACP session loads before publishing their model catalog",
  },
  {
    commit: "8e52943581fe194dc2ada05636d96e8b1da0d639",
    label: "Provide secure random to ACP load replay regression tests",
  },
  {
    commit: "60ae78109e5f5eac13702dc98f625e020dc26561",
    label: "Show native OMP activity and metrics while waiting for task results",
  },
  {
    commit: "f089fd04434f538cbdfb92e2c78c36d8525db344",
    label: "Show OMP task jobs in native subagent views with reported progress",
  },
  {
    commit: "73d1ec7efeedb5f8c4ba56f324a5f94a644c1bca",
    label: "Preserve the ACP Registry digest service requirement",
  },
  {
    commit: "e68f17673e2b818749e07c9a53e8faa811e4d76e",
    label: "Discover and preserve OMP thinking tiers for each model and account",
  },
  {
    commit: "9ced10267d39f83673b61dd59f73049f579d3b04",
    label: "Use destination model defaults after manual draft environment switches",
  },
  {
    commit: "fc713377ce22d73670f204389dc0838818c0d613",
    label: "Keep the Antigravity stop regression compatible with Effect diagnostics",
  },
];

function run(command: string, args: ReadonlyArray<string>) {
  return NodeChildProcess.execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

const git = (...args: string[]) => run("git", args);
const api = <T>(endpoint: string, query = "."): T =>
  JSON.parse(run("gh", ["api", endpoint, "--jq", query])) as T;
const output = (name: string, value: string) =>
  NodeFS.appendFileSync(requiredEnv("GITHUB_OUTPUT"), `${name}=${value}\n`);

function replaceRequired(file: string, before: string, after: string) {
  const source = NodeFS.readFileSync(file, "utf8");
  if (!source.includes(before)) throw new Error(`Upstream build seam changed: ${file}`);
  NodeFS.writeFileSync(file, source.replace(before, after));
}

// A conflicted carried fix can retain the pre-migration Crypto service even
// though the current Effect version exposes Digest and SecureRandom separately.
// Normalize only the exact known shape; fail closed if that shape changes.
export function normalizeAcpRandomCompatibility(source: string): string {
  const legacyImport = 'import * as Crypto from "effect/Crypto";';
  if (!source.includes(legacyImport)) {
    if (/\bCrypto\b|effect\/Crypto/.test(source))
      throw new Error("Unexpected ACP random compatibility shape: unrecognized Crypto reference");
    return source;
  }
  if ((source.match(/\bcrypto\b/g) ?? []).length !== 5)
    throw new Error("Unexpected ACP random compatibility shape: extra crypto binding references");
  const replacements: ReadonlyArray<readonly [string, string, number]> = [
    [
      legacyImport,
      'import * as Digest from "effect/crypto/Digest";\nimport * as SecureRandom from "effect/crypto/SecureRandom";',
      1,
    ],
    ["Crypto.Crypto", "SecureRandom.SecureRandom", 6],
    [
      "const crypto = yield* SecureRandom.SecureRandom;",
      "const random = yield* SecureRandom.SecureRandom;",
      1,
    ],
    ["SecureRandom.SecureRandom, crypto)", "SecureRandom.SecureRandom, random)", 4],
  ];
  let result = source;
  for (const [before, after, expected] of replacements) {
    const count = result.split(before).length - 1;
    if (count !== expected)
      throw new Error(
        `Unexpected ACP random compatibility shape: ${before} (${count}, expected ${expected})`,
      );
    result = result.replaceAll(before, after);
  }
  if (/\bCrypto\b|effect\/Crypto/.test(result))
    throw new Error("Unexpected ACP random compatibility shape: residual Crypto reference");
  return result;
}

function resolveConflict(commit: string, allowedFiles: ReadonlyArray<string>) {
  if (!process.env.COPILOT_GITHUB_TOKEN)
    throw new Error("Set the COPILOT_GITHUB_TOKEN Actions secret to resolve conflicts.");
  const conflicts = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  if (conflicts.length === 0)
    throw new Error(`Cherry-pick failed without a merge conflict: ${commit}`);
  const prompt = `Resolve this cherry-pick conflict, preserving both the official upstream behavior and the intended bug fix in commit ${commit}.
Only edit these files: ${JSON.stringify(allowedFiles)}.
Inspect git show ${commit} and git diff. Preserve upstream deletions of obsolete tests instead of resurrecting them.
Do not change tests to hide a broken fix. Do not change workflows, credentials, package versions or release configuration.
Do not commit, push, start agents, or access the network. Resolve files only; the caller stages them and continues the cherry-pick.
Conflicted files: ${JSON.stringify(conflicts)}.`;
  // The resolver gets only its Copilot credential, never the repository write token.
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const resolved = NodeChildProcess.spawnSync(
    "copilot",
    [
      "-p",
      prompt,
      "--no-ask-user",
      "--allow-tool=write",
      "--allow-tool=shell(git diff:*)",
      "--allow-tool=shell(git show:*)",
      "--allow-tool=shell(git status:*)",
    ],
    { env, stdio: "inherit", timeout: 600_000 },
  );
  if (resolved.error || resolved.status !== 0)
    throw new Error("Copilot conflict resolution failed.");
  const touched = git("diff", "HEAD", "--name-only").split("\n").filter(Boolean);
  if (touched.some((file) => !allowedFiles.includes(file)))
    throw new Error("Conflict resolver changed a file outside the fix.");
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  if (untracked.some((file) => !allowedFiles.includes(file)))
    throw new Error("Conflict resolver created a file outside the fix.");
  // Stage the verified changes, including deletions, without naming files upstream already removed.
  git("add", "-A");
  git("diff", "--cached", "--check");
  git("-c", "core.editor=true", "cherry-pick", "--continue");
}

export function personalVersion(upstreamVersion: string, runNumber: number) {
  if (!/^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(upstreamVersion))
    throw new Error("Expected an official nightly version.");
  if (!Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber >= 100_000)
    throw new Error("Workflow run number exceeds the fork version range.");
  return upstreamVersion.replace(
    /\.(\d+)$/,
    (_, build) => `.${Number(build) * 100_000 + runNumber}`,
  );
}

export function officialNightly<T extends { readonly draft?: boolean; readonly tag_name: string }>(
  releases: ReadonlyArray<T>,
) {
  const release = releases.find(
    (entry) => !entry.draft && /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(entry.tag_name),
  );
  if (!release) throw new Error("No official nightly found.");
  return release;
}

type Release = {
  readonly tag_name: string;
  readonly draft: boolean;
  readonly html_url: string;
  readonly body?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing workflow environment variable: ${name}`);
  return value;
}

/** Publish application source without importing workflow edits or their history. */
export function createBuildSnapshot(input: {
  readonly repoPath: string;
  readonly automationCommit: string;
  readonly upstreamTag: string;
}): string {
  const readGit = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, { cwd: input.repoPath, encoding: "utf8" }).trim();
  const replaceSubtree = (tree: string, name: string, child: string) => {
    const entries = readGit("ls-tree", "-z", tree)
      .split("\0")
      .filter((entry) => entry && !entry.endsWith(`\t${name}`));
    entries.push(`040000 tree ${child}\t${name}`);
    return NodeChildProcess.execFileSync("git", ["mktree", "-z"], {
      cwd: input.repoPath,
      encoding: "utf8",
      input: `${entries.join("\0")}\0`,
    }).trim();
  };
  const workflows = readGit("rev-parse", `${input.automationCommit}:.github/workflows`);
  const github = replaceSubtree("HEAD:.github", "workflows", workflows);
  const tree = replaceSubtree("HEAD", ".github", github);
  // The only new commit is parented by an existing fork commit. Reverting workflow
  // files on top of upstream history would still introduce those workflow edits.
  return readGit(
    "commit-tree",
    tree,
    "-p",
    input.automationCommit,
    "-m",
    `build: snapshot ${input.upstreamTag} with personal fixes`,
  );
}

function prepare() {
  if (process.env.GITHUB_REPOSITORY !== fork)
    throw new Error("This workflow belongs to the personal fork only.");
  // Release payloads include every asset and can exceed the subprocess buffer.
  const releaseFields = 'map({tag_name, draft, html_url, body: ((.body // "")|split("\\n")[0])})';
  const releases = api<Release[]>(`repos/${upstream}/releases?per_page=100`, releaseFields);
  const release = officialNightly(releases);
  const existing = api<Release[]>(`repos/${fork}/releases?per_page=100`, releaseFields);
  const marker = `Upstream: ${release.html_url}`;
  if (
    process.env.FORCE_BUILD !== "true" &&
    existing.some((entry) => !entry.draft && entry.body?.includes(marker))
  ) {
    output("build", "false");
    return;
  }
  const upstreamVersion = release.tag_name.slice(1);
  const automationCommit = git("rev-parse", "HEAD");
  const returnScripts = ["ps1", "sh"].map((extension) => ({
    extension,
    source: NodeFS.readFileSync(`${import.meta.dirname}/personal-return.${extension}`, "utf8"),
  }));
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
  const version = personalVersion(upstreamVersion, runNumber);
  const branch = `personal-build/${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  git("config", "user.name", "Microck");
  git("config", "user.email", "contact@micr.dev");
  git("remote", "add", "upstream", `https://github.com/${upstream}.git`);
  git("fetch", "upstream", `refs/tags/${release.tag_name}`);
  git("switch", "-c", branch, "FETCH_HEAD");
  const applied = [];
  for (const fix of fixes) {
    const pr =
      fix.pr === undefined
        ? undefined
        : api<{ merged: boolean; merge_commit_sha: string | null }>(
            `repos/${upstream}/pulls/${fix.pr}`,
          );
    if (
      pr?.merged &&
      pr.merge_commit_sha &&
      NodeChildProcess.spawnSync("git", [
        "merge-base",
        "--is-ancestor",
        pr.merge_commit_sha,
        "HEAD",
      ]).status === 0
    )
      continue;
    git("fetch", "origin", fix.commit);
    const allowedFiles = git("diff-tree", "--no-commit-id", "--name-only", "-r", fix.commit)
      .split("\n")
      .filter(Boolean);
    if (allowedFiles.some((file) => file.startsWith(".github/workflows/")))
      throw new Error(
        "Carried fixes cannot edit workflows; update personal-updates automation instead.",
      );
    const picked = NodeChildProcess.spawnSync("git", ["cherry-pick", "--empty=drop", fix.commit], {
      stdio: "inherit",
    });
    if (picked.status !== 0) resolveConflict(fix.commit, allowedFiles);
    if (fix.pr !== undefined) applied.push(`https://github.com/${upstream}/pull/${fix.pr}`);
    else if (fix.label)
      applied.push(`${fix.label}: https://github.com/${fork}/commit/${fix.commit}`);
  }
  const acpDriver = "packages/provider-acp-registry/src/server/driver.ts";
  const acpSource = NodeFS.readFileSync(acpDriver, "utf8");
  const normalizedAcpSource = normalizeAcpRandomCompatibility(acpSource);
  if (normalizedAcpSource !== acpSource) {
    NodeFS.writeFileSync(acpDriver, normalizedAcpSource);
    git("add", acpDriver);
    git("commit", "-m", "fix(acp): retain current random and digest services");
  }
  const acpRuntime = "packages/provider-acp/src/server/AcpSessionRuntime.ts";
  const runtimeSource = NodeFS.readFileSync(acpRuntime, "utf8");
  const normalizedRuntime = normalizeLoadResponse(runtimeSource);
  if (normalizedRuntime !== runtimeSource) {
    NodeFS.writeFileSync(acpRuntime, normalizedRuntime);
    git("add", acpRuntime);
    git("commit", "-m", "fix(acp): await the session load response");
  }
  // The CLI release index and downloads must point at the same distribution.
  replaceRequired(
    "packages/shared/src/cliRelease.ts",
    `const CLI_RELEASE_REPOSITORY = "${upstream}";`,
    `const CLI_RELEASE_REPOSITORY = "${fork}";`,
  );
  replaceRequired("scripts/install.sh", `repo="${upstream}"`, `repo="${fork}"`);
  replaceRequired("scripts/install.ps1", `$repo = "${upstream}"`, `$repo = "${fork}"`);
  replaceRequired(
    "scripts/install.sh",
    'channel="${T3CODE_CHANNEL:-stable}"',
    'channel="${T3CODE_CHANNEL:-nightly}"',
  );
  replaceRequired(
    "scripts/install.ps1",
    '$channel = if ($env:T3CODE_CHANNEL) { $env:T3CODE_CHANNEL } else { "stable" }',
    '$channel = if ($env:T3CODE_CHANNEL) { $env:T3CODE_CHANNEL } else { "nightly" }',
  );
  git("add", "packages/shared/src/cliRelease.ts", "scripts/install.sh", "scripts/install.ps1");
  git("commit", "-m", "build: follow personal release feeds");
  const source = createBuildSnapshot({
    repoPath: process.cwd(),
    automationCommit,
    upstreamTag: release.tag_name,
  });
  git("push", "origin", `${source}:refs/heads/${branch}`);
  const notes = `${marker}\n\nOfficial source version: ${upstreamVersion}\nFork version: ${version}\n\nCarried fixes:\n${applied.map((url) => `- ${url}`).join("\n") || "- All tracked fixes are upstream."}\n\nWindows x64 desktop and Linux ARM64 server. Windows installer is unsigned.\n\nReturn to official T3 without uninstalling or deleting data: install the official ${upstreamVersion} desktop installer over this build. For the server, use the official installer and its update command with --allow-downgrade --yes. Full instructions: https://github.com/${fork}/blob/personal-updates/docs/operations/personal-releases.md\n`;
  NodeFS.writeFileSync(process.env.RUNNER_TEMP + "/personal-release-notes.md", notes);
  for (const script of returnScripts) {
    NodeFS.writeFileSync(
      `${process.env.RUNNER_TEMP}/return-to-official.${script.extension}`,
      script.source.replaceAll("__UPSTREAM_VERSION__", upstreamVersion),
    );
  }
  for (const extension of ["sh", "ps1"]) {
    NodeFS.copyFileSync(
      `scripts/install.${extension}`,
      `${process.env.RUNNER_TEMP}/install-personal.${extension}`,
    );
  }
  for (const [key, value] of Object.entries({
    build: "true",
    source,
    branch,
    version,
    upstream: upstreamVersion,
  }))
    output(key, value);
}

if (import.meta.main) prepare();
