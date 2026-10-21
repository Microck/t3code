import { expect, it } from "vite-plus/test";
import type { OmpTaskProgress } from "@t3tools/client-runtime/work-log/item-detail";
import { render } from "../../../test/render";
import { OmpTaskProgressDisplay } from "./omp-task-progress";

it("expands a native agent and keeps its details open through progress and completion", async () => {
  const agent = {
    id: "camera-review",
    agent: "worker",
    status: "running" as const,
    task: "Review capture <settings>",
    recentTools: [{ tool: "read", args: "camera.swift", endMs: 100 }],
    recentOutput: ["Checking exposure"],
    toolCount: 1,
    tokens: 2000,
    cost: 0.01,
    durationMs: 1000,
    currentTool: "read",
    currentToolArgs: "camera.swift",
    resolvedModel: "gpt-6-luna",
  };
  const progress: OmpTaskProgress = { agents: [agent], text: null };
  await using screen = await render(<OmpTaskProgressDisplay progress={progress} />);
  await expect.element(screen.getByText("Review capture <settings>")).not.toBeVisible();
  await screen.getByText("camera-review", { exact: true }).click();
  await expect.element(screen.getByText("Review capture <settings>")).toBeVisible();
  await expect.element(screen.getByText("Checking exposure", { exact: true })).toBeVisible();
  await screen.rerender(
    <OmpTaskProgressDisplay
      progress={{
        ...progress,
        agents: [
          {
            ...agent,
            status: "completed",
            currentTool: "",
            recentOutput: ["Exposure correct"],
          },
        ],
      }}
    />,
  );
  await expect.element(screen.getByText("worker · completed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Exposure correct", { exact: true })).toBeVisible();
  await screen.getByText("camera-review", { exact: true }).click();
  await expect.element(screen.getByText("Exposure correct", { exact: true })).not.toBeVisible();
});
