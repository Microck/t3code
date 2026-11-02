import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import { cleanup } from "./personal-release-cleanup.mjs";

const json = (data) => new Response(JSON.stringify(data));
function fixture(responses, overrides = {}) {
  const calls = [];
  return {
    calls,
    run: () =>
      cleanup({
        runId: "42",
        branch: "personal-build/42-1",
        token: "test-token",
        sleep: async () => {},
        log: () => {},
        fetchImpl: async (url, options) => {
          calls.push({ url, method: options.method });
          NodeAssert.equal(options.redirect, "error");
          const response = responses.shift();
          if (response instanceof Error) throw response;
          NodeAssert.ok(response, "Unexpected API request");
          return response;
        },
        ...overrides,
      }),
  };
}

NodeTest.test("empty DELETE bodies succeed and only run-owned objects are deleted", async () => {
  const f = fixture([
    json({ artifacts: [{ id: 7 }] }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 204 }),
  ]);
  await f.run();
  NodeAssert.deepEqual(
    f.calls.map(({ method, url }) => [method, url.split("/t3code/")[1]]),
    [
      ["GET", "actions/runs/42/artifacts?per_page=100&page=1"],
      ["DELETE", "git/refs/heads/personal-build/42-1"],
      ["DELETE", "actions/artifacts/7"],
    ],
  );
});

NodeTest.test("already removed ref and artifact make retries idempotent", async () => {
  const f = fixture([
    json({ artifacts: [{ id: 7 }] }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 404 }),
  ]);
  await f.run();
});

NodeTest.test(
  "GitHub's missing-reference 422 succeeds, but unrelated 422 errors fail",
  async () => {
    const missing = new Response(JSON.stringify({ message: "Reference does not exist" }), {
      status: 422,
    });
    const f = fixture([
      json({ artifacts: [{ id: 7 }] }),
      missing,
      new Response(null, { status: 204 }),
    ]);
    await f.run();
    for (const body of [JSON.stringify({ message: "Reference update failed" }), "invalid JSON"]) {
      const failed = fixture([json({ artifacts: [] }), new Response(body, { status: 422 })]);
      await NodeAssert.rejects(failed.run(), /HTTP 422/);
    }
    const artifact = fixture([
      json({ artifacts: [{ id: 7 }] }),
      new Response(null, { status: 204 }),
      new Response(JSON.stringify({ message: "Reference does not exist" }), { status: 422 }),
    ]);
    await NodeAssert.rejects(artifact.run(), /HTTP 422/);
  },
);

NodeTest.test("truncated listing retries before any destructive request", async () => {
  const f = fixture([
    new Response("{"),
    json({ artifacts: [] }),
    new Response(null, { status: 204 }),
  ]);
  await f.run();
  NodeAssert.deepEqual(
    f.calls.map((c) => c.method),
    ["GET", "GET", "DELETE"],
  );
});

NodeTest.test("persistent malformed JSON fails visibly without deleting", async () => {
  const f = fixture([new Response(""), new Response("{"), new Response("invalid")]);
  await NodeAssert.rejects(f.run(), /invalid JSON or artifact listing after 3 attempts/);
  NodeAssert.ok(f.calls.every((c) => c.method === "GET"));
});

NodeTest.test("all pages are read before deletion shifts the listing", async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
  const f = fixture([
    json({ artifacts: first }),
    json({ artifacts: [{ id: 101 }] }),
    ...Array.from({ length: 102 }, () => new Response(null, { status: 204 })),
  ]);
  await f.run();
  NodeAssert.equal(f.calls.length, 104);
  NodeAssert.match(f.calls[1].url, /page=2$/);
  NodeAssert.ok(f.calls.slice(2).every((c) => c.method === "DELETE"));
  NodeAssert.deepEqual(
    f.calls.slice(3).map(({ url }) => url.split("/t3code/")[1]),
    Array.from({ length: 101 }, (_, i) => `actions/artifacts/${i + 1}`),
  );
});

for (const status of [401, 403, 404, 429]) {
  NodeTest.test(`listing HTTP ${status} is not treated as an empty run`, async () => {
    const f = fixture([new Response(null, { status })]);
    await NodeAssert.rejects(f.run(), new RegExp(`HTTP ${status}`));
    NodeAssert.equal(f.calls.length, 1);
  });
}

NodeTest.test("transient server and uncertain DELETE transport failures are bounded", async () => {
  const f = fixture([
    new Response(null, { status: 502 }),
    json({ artifacts: [] }),
    new Error("connection lost"),
    new Response(null, { status: 404 }),
  ]);
  await f.run();
  NodeAssert.equal(f.calls.length, 4);
});

NodeTest.test("persistent DELETE error fails instead of masking cleanup failure", async () => {
  const f = fixture([
    json({ artifacts: [] }),
    ...Array.from({ length: 3 }, () => new Response(null, { status: 503 })),
  ]);
  await NodeAssert.rejects(f.run(), /HTTP 503/);
  NodeAssert.equal(f.calls.length, 4);
});

NodeTest.test("malformed artifact IDs fail before branch deletion", async () => {
  for (const id of ["7", -1, 1.5, 0, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture([json({ artifacts: [{ id }] })]);
    await NodeAssert.rejects(f.run(), /Invalid artifact ID/);
    NodeAssert.equal(f.calls.length, 1);
  }
});

NodeTest.test("missing artifact array is not an empty success", async () => {
  const f = fixture([json({}), json(null), json({ artifacts: {} })]);
  await NodeAssert.rejects(f.run(), /invalid JSON or artifact listing after 3 attempts/);
  NodeAssert.equal(f.calls.length, 3);
  NodeAssert.ok(f.calls.every((c) => c.method === "GET"));
});

NodeTest.test(
  "reject unrelated branches, invalid run IDs and missing token before network",
  async () => {
    for (const overrides of [
      { branch: "main" },
      { branch: "personal-build/43-1" },
      { branch: "personal-build/42-1/other" },
      { runId: "../42" },
      { token: "" },
    ]) {
      const f = fixture([], overrides);
      await NodeAssert.rejects(f.run());
      NodeAssert.equal(f.calls.length, 0);
    }
  },
);

NodeTest.test("no-build run has no branch and no artifacts to remove", async () => {
  const f = fixture([json({ artifacts: [] })], { branch: "" });
  await f.run();
  NodeAssert.equal(f.calls.length, 1);
});

NodeTest.test("malformed listing shape retries before deletion", async () => {
  const f = fixture([json(null), json({ artifacts: [] }), new Response(null, { status: 204 })]);
  await f.run();
  NodeAssert.deepEqual(
    f.calls.map((c) => c.method),
    ["GET", "GET", "DELETE"],
  );
});
