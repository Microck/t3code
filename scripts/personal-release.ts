// This bootstrap runs before dependency installation, outside the app's Effect runtime.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";

const upstream = "pingdotgg/t3code";
const fork = "Microck/t3code";
const fixes: ReadonlyArray<{
  readonly pr?: number;
  readonly commit: string;
  readonly label?: string;
}> = [
  // This rebased copy preserves upstream's deletion of the obsolete web test.
  { pr: 22466, commit: "fd47810fb03908bf7af6b2c62fe6c036c75b820b" },
  { pr: 22842, commit: "7023133093f93a329532e8021bf9c7e43106d56d" },
  // Includes the activation-preference prerequisite needed for one resume after Stop.
  { pr: 21439, commit: "c0057c6c51f2f24b39bd9c8ca7ce1800213df54f" },
  { pr: 21323, commit: "0791507a577396732fbc2d07933c736e1da629d9" },
  { pr: 22698, commit: "fca90d2e0d3b25f9ef74591a48cd73f119ba0a6d" },
  { pr: 20363, commit: "3309cdfaa9f42a87eaf47e6f08fa075f3155201c" },
  { pr: 21066, commit: "df744d509e241c09c31297f035cad170b3152ba0" },
  { pr: 21770, commit: "616964bdd5ce2cea5a0d47c56c10db419c1b0b52" },
  { pr: 21801, commit: "e348de82fdca7720c85a5899e9f66832e409a0e4" },
  { pr: 22972, commit: "119c0da542105389858f50a665d44cd4fa42ed71" },
  {
    commit: "a0c2bab73bfd075a57c59afc0f9472835d48e409",
    label: "OMP choices and custom answers in one question step",
  },
  {
    commit: "ab1a5f30df2c5b9bc81d4735aa2cc9fcadf97372",
    label: "Native OMP task progress on web, desktop and mobile",
  },
  {
    commit: "4d0ef330fdaafe9141eee7d2446616c9831989b1",
    label: "OMP model family logos and reported completion estimates",
  },
  {
    commit: "a8e71d07247c3bccd9de3309370193a162b2d0e7",
    label: "Native OMP wait jobs displayed as subagent status rows",
  },
  {
    commit: "6d8b72966b9496b783a56f7835195fda87bdb374",
    label: "Distribution-aware remote update checks",
  },
  {
    commit: "0e07d97b6ecd762a5b37e588d60e42a6fea2e53d",
  },
  {
    commit: "1d6efdce95a7f1245a25b09984ca0d1d2700caaa",
  },
  {
    commit: "87d2500ab936ef32dde6ec5dc2541d56d94559e5",
    label: "Recover shared Codex sessions after the app-server process exits",
  },
  {
    commit: "ee24af6141a68d93318b31a57b737a0b85eb50b8",
    label: "Package mirror failover on GitHub-hosted runners",
  },
  {
    commit: "75d44d29be896062910d0c2d9fa3ba2dd3afa5af",
    label: "Discover every advertised ACP command and skill without a count cap",
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
  git("add", "-A", "--", ...allowedFiles);
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
    const picked = NodeChildProcess.spawnSync("git", ["cherry-pick", fix.commit], {
      stdio: "inherit",
    });
    if (picked.status !== 0) resolveConflict(fix.commit, allowedFiles);
    if (fix.pr !== undefined) applied.push(`https://github.com/${upstream}/pull/${fix.pr}`);
    else if (fix.label)
      applied.push(`${fix.label}: https://github.com/${fork}/commit/${fix.commit}`);
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
