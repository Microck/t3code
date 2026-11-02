import { pathToFileURL } from "node:url";

const repository = "Microck/t3code";

// Cleanup is repeatable: an absent generated ref/artifact already meets the goal.
// Never decode successful DELETE responses, which normally have no JSON body.
export async function cleanup({ runId, branch, token, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console.log }) {
  if (!/^\d+$/.test(runId)) throw new Error("Invalid workflow run ID");
  if (branch && !new RegExp(`^personal-build/${runId}-[1-9]\\d*$`).test(branch)) {
    throw new Error("Refusing to clean a branch outside this workflow run");
  }
  if (!token) throw new Error("Missing workflow token");

  async function request(path, method = "GET") {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        });
      } catch {
        if (attempt === 2) throw new Error(`${method} ${path}: transport failed after 3 attempts`);
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (method === "DELETE" && (response.ok || response.status === 404)) return;
      if (method === "DELETE" && path.startsWith("git/refs/heads/") && response.status === 422) {
        const error = await response.json().catch(() => null);
        if (error?.message === "Reference does not exist") return;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(`${method} ${path}: HTTP ${response.status}`);
      }
      try {
        return await response.json();
      } catch {
        if (attempt === 2) throw new Error(`GET ${path}: invalid JSON after 3 attempts`);
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  // Collect every page before deleting anything; deletion shifts pagination.
  const artifacts = new Set();
  for (let page = 1; ; page++) {
    const data = await request(`actions/runs/${runId}/artifacts?per_page=100&page=${page}`);
    if (!Array.isArray(data.artifacts)) throw new Error("Invalid artifact listing");
    for (const artifact of data.artifacts) {
      if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0) throw new Error("Invalid artifact ID");
      artifacts.add(artifact.id);
    }
    if (data.artifacts.length < 100) break;
  }
  if (branch) {
    await request(`git/refs/heads/${branch}`, "DELETE");
    log(`Generated branch absent: ${branch}`);
  }
  for (const id of artifacts) {
    await request(`actions/artifacts/${id}`, "DELETE");
    log(`Intermediate artifact absent: ${id}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cleanup({ runId: process.env.RUN_ID ?? "", branch: process.env.BRANCH ?? "", token: process.env.GH_TOKEN });
}
