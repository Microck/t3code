import type { GitRunStackedActionResult, GitStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { getGitProgressToastAction } from "./components/GitActionsControl";

function makeStatus(overrides?: Partial<GitStatusResult>): GitStatusResult {
  return {
    branch: "feature/test-branch",
    hasWorkingTreeChanges: false,
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    openPr: null,
    ...overrides,
  };
}

function makeResult(overrides?: Partial<GitRunStackedActionResult>): GitRunStackedActionResult {
  return {
    action: "commit_push",
    commit: { status: "skipped_no_changes" },
    push: { status: "pushed", branch: "feature/test-branch" },
    pr: { status: "skipped_not_requested" },
    ...overrides,
  };
}

describe("getGitProgressToastAction", () => {
  it("returns open PR action when a PR URL is available", () => {
    const action = getGitProgressToastAction({
      isRunning: false,
      hasError: false,
      result: makeResult(),
      gitStatus: makeStatus(),
      openPrUrl: "https://github.com/pingdotgg/codething-mvp/pull/42",
    });

    expect(action).toEqual({
      kind: "open_pr",
      label: "Open PR",
    });
  });

  it("returns create PR action after push when branch can open a PR", () => {
    const action = getGitProgressToastAction({
      isRunning: false,
      hasError: false,
      result: makeResult({ action: "commit_push" }),
      gitStatus: makeStatus(),
      openPrUrl: null,
    });

    expect(action).toEqual({
      kind: "create_pr",
      label: "Create PR",
    });
  });

  it("does not return create PR action for non-push actions", () => {
    const action = getGitProgressToastAction({
      isRunning: false,
      hasError: false,
      result: makeResult({ action: "commit" }),
      gitStatus: makeStatus(),
      openPrUrl: null,
    });

    expect(action).toBeNull();
  });

  it("returns null while running or failed", () => {
    const running = getGitProgressToastAction({
      isRunning: true,
      hasError: false,
      result: makeResult(),
      gitStatus: makeStatus(),
      openPrUrl: "https://github.com/pingdotgg/codething-mvp/pull/42",
    });

    const failed = getGitProgressToastAction({
      isRunning: false,
      hasError: true,
      result: makeResult(),
      gitStatus: makeStatus(),
      openPrUrl: "https://github.com/pingdotgg/codething-mvp/pull/42",
    });

    expect(running).toBeNull();
    expect(failed).toBeNull();
  });
});
