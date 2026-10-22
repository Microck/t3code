import { describe, expect, it } from "vite-plus/test";
import { readOmpTaskProgress, ompAgentMetrics, ompAgentStatus } from "./itemDetail";

const progress = {
  index: 0,
  id: "review",
  agent: "worker",
  status: "running",
  task: "Review the camera",
  recentTools: [{ tool: "read", args: "camera.swift", endMs: 12 }],
  recentOutput: ["Checking capture settings"],
  toolCount: 3,
  requests: 2,
  tokens: 120000,
  cost: 0.12,
  durationMs: 12400,
  resolvedModel: "gpt-6-luna",
  contextTokens: 20000,
  contextWindow: 200000,
  currentTool: "read",
  currentToolArgs: "camera.swift",
};

function requireProgress(output: unknown) {
  const task = readOmpTaskProgress(output);
  if (task?.kind !== "progress") throw new Error("Expected native task progress");
  return task;
}

describe("OMP task progress", () => {
  it("recognizes native ACP results while preserving the final answer and distinct token counts", () => {
    const task = requireProgress({
      content: [{ type: "text", text: "Review complete" }],
      details: { progress: [progress], results: [] },
    });
    expect(task.text).toBe("Review complete");
    expect(task.agents).toHaveLength(1);
    const agent = task.agents[0]!;
    expect(agent.currentTool).toBe("read");
    expect(agent.recentTools[0]?.args).toBe("camera.swift");
    expect(ompAgentMetrics(agent)).toBe(
      "3 tools · 120K tokens · context 20K / 200K · $0.1200 · 12s",
    );
    expect(ompAgentStatus(agent)).toBe("running");
  });

  it("preserves reported completion estimates without confusing them with context usage", () => {
    for (const completionPercent of [0, 42.4, 100]) {
      const task = requireProgress({
        details: {
          progress: [
            { ...progress, completionPercent, resolvedModelIdentity: "openai-codex/gpt-6-luna" },
          ],
        },
      });
      const agent = task.agents[0]!;
      expect(agent.completionPercent).toBe(completionPercent);
      expect(agent.resolvedModelIdentity).toBe("openai-codex/gpt-6-luna");
      expect(ompAgentStatus(agent)).toBe(`running · ~${Math.round(completionPercent)}%`);
      expect(ompAgentMetrics(agent)).toContain("context 20K / 200K");
      expect(ompAgentStatus({ ...agent, status: "completed" })).toBe("completed");
      expect(ompAgentStatus({ ...agent, status: "failed" })).toBe("failed");
    }
    for (const completionPercent of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        readOmpTaskProgress({ details: { progress: [{ ...progress, completionPercent }] } }),
      ).toBeNull();
    }
  });

  it("keeps retry failures visible and recognizes completion and stop", () => {
    for (const status of ["completed", "failed", "aborted"]) {
      const task = requireProgress({ details: { progress: [{ ...progress, status }] } });
      expect(ompAgentStatus(task.agents[0]!)).toBe(status === "aborted" ? "Stopped" : status);
    }
    const task = requireProgress({
      details: {
        progress: [{ ...progress, retryState: { attempt: 2, errorMessage: "Rate limited" } }],
      },
    });
    expect(ompAgentStatus(task.agents[0]!)).toBe("Retrying (2)");
    expect(task.agents[0]?.retryState?.errorMessage).toBe("Rate limited");
  });

  it("leaves ordinary, empty and malformed tool output on the generic renderer", () => {
    for (const output of [
      null,
      "hello",
      { progress: [progress] },
      { details: { progress: [] } },
      { details: { progress: [{ ...progress, status: "invented" }] } },
      { details: { progress: [{ id: "unrelated" }] } },
    ]) {
      expect(readOmpTaskProgress(output)).toBeNull();
    }
  });
});

describe("OMP wait jobs", () => {
  const job = {
    id: "MineOmp",
    type: "task",
    status: "running",
    label: "MineOmp",
    durationMs: 180019,
    resolvedModel: "openai-codex/gpt-6.1-sol:medium",
    resolvedModelIdentity: "openai-codex/gpt-6.1-sol",
    resolvedThinkingLevel: "medium",
  };
  it("reads the native wait snapshot without inventing task metrics", () => {
    const wait = readOmpTaskProgress({
      content: [{ type: "text", text: "Waiting for miners" }],
      details: { op: "wait", jobs: [job] },
    });
    expect(wait).toEqual({ kind: "jobs", jobs: [job], text: "Waiting for miners" });
    if (wait?.kind !== "jobs") throw new Error("Expected native wait jobs");
    expect(ompAgentStatus(wait.jobs[0]!)).toBe("running");
    expect(wait.jobs[0]).not.toHaveProperty("tokens");
    expect(wait.jobs[0]).not.toHaveProperty("toolCount");
  });
  it("preserves mixed jobs, terminal outcomes, results and reported estimates", () => {
    const jobs = [
      { ...job, completionPercent: 42 },
      {
        ...job,
        id: "Shell",
        type: "bash",
        status: "failed",
        exitCode: 1,
        errorText: "Command failed",
      },
      { ...job, id: "Eval", type: "eval", status: "completed", resultText: "Evaluation complete" },
      { ...job, id: "Cancelled", status: "cancelled" },
    ];
    const wait = readOmpTaskProgress({ details: { op: "wait", jobs } });
    if (wait?.kind !== "jobs") throw new Error("Expected native wait jobs");
    expect(wait.jobs).toEqual(jobs);
    expect(wait.jobs.map(ompAgentStatus)).toEqual([
      "running · ~42%",
      "failed",
      "completed",
      "cancelled",
    ]);
  });
  it("keeps unrelated and malformed job lists on the generic renderer", () => {
    for (const details of [
      { jobs: [job] },
      { op: "other", jobs: [job] },
      { op: "wait", jobs: [] },
      { op: "wait", jobs: [{ ...job, type: "unknown" }] },
      { op: "wait", jobs: [{ ...job, status: "unknown" }] },
      { op: "wait", jobs: [{ id: job.id, type: "task", status: "running" }] },
    ])
      expect(readOmpTaskProgress({ details })).toBeNull();
  });
});
