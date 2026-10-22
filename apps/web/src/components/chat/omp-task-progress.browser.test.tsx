import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { expect, it } from "vite-plus/test";
import {
  readOmpTaskProgress,
  type OmpTaskProgress,
} from "@t3tools/client-runtime/work-log/item-detail";
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
    resolvedModel: "luna",
    resolvedModelIdentity: "openai-codex/gpt-6-luna",
    completionPercent: 42,
  };
  const progress: OmpTaskProgress = { kind: "progress", agents: [agent], text: null };
  await using screen = await render(<OmpTaskProgressDisplay progress={progress} />);
  await expect
    .element(screen.getByText("worker · running · ~42% · read", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("img", { name: "OpenAI model" })).toBeVisible();
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

it("changes the OMP model logo without changing the provider or selection", async () => {
  const instanceId = ProviderInstanceId.make("omp-local");
  const driver = ProviderDriverKind.make("acpRegistry");
  const models = ["maisa-codex/gpt-daybreak-blue-latest", "anthropic/claude-opus-5.5"].map(
    (slug) => ({ slug, name: slug, isCustom: false, capabilities: {} }),
  );
  const snapshot: ServerProvider = {
    instanceId,
    driver,
    displayName: "Renamed local agent",
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-22T00:00:00.000Z",
    models,
    slashCommands: [],
    skills: [],
  };
  const entries = applyProviderInstanceSettings(
    deriveProviderInstanceEntries([snapshot]),
    {
      providerInstances: {
        [instanceId]: {
          driver,
          enabled: true,
          config: { source: "local", commandPath: "/bin/omp", commandArgs: ["acp"] },
        },
      },
      projectSettingsOverrides: {},
    },
    null,
  );
  const selections: string[] = [];
  const picker = (model: string) => (
    <ProviderModelPicker
      environmentId={null}
      activeInstanceId={instanceId}
      model={model}
      lockedProvider={null}
      instanceEntries={entries}
      modelOptionsByInstance={new Map([[instanceId, models]])}
      onInstanceModelChange={(id, selected) => selections.push(`${id}:${selected}`)}
    />
  );
  await using screen = await render(picker(models[0]!.slug));
  await expect.element(screen.getByRole("img", { name: "OpenAI model" })).toBeVisible();
  await screen.rerender(picker(models[1]!.slug));
  await expect.element(screen.getByRole("img", { name: "Anthropic model" })).toBeVisible();
  expect(selections).toEqual([]);
});

it("shows all four native wait jobs and retains expanded results as they settle", async () => {
  const jobs = ["MineClaude", "MineCodex", "MineOmp", "MineGeminiHermesT3"].map((id) => ({
    id,
    type: "task",
    status: "running",
    label: id,
    durationMs: 180019,
    resolvedModel: "openai-codex/gpt-6.1-sol:medium",
    resolvedModelIdentity: "openai-codex/gpt-6.1-sol",
    resolvedThinkingLevel: "medium",
  }));
  const initial = readOmpTaskProgress({ details: { op: "wait", jobs } });
  if (!initial) throw new Error("Expected native wait snapshot");
  await using screen = await render(<OmpTaskProgressDisplay progress={initial} />);
  for (const job of jobs)
    await expect.element(screen.getByText(job.id, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("list", { name: "Background jobs" })).toBeVisible();
  expect(screen.container.textContent).not.toContain("0 tokens");
  expect(screen.container.textContent).not.toContain("0 tools");
  expect(screen.container.textContent).not.toContain("$0.0000");
  await screen.getByText("MineOmp", { exact: true }).click();
  await expect
    .element(
      screen
        .getByRole("group", { name: "MineOmp" })
        .getByText("openai-codex/gpt-6.1-sol", { exact: true }),
    )
    .toBeVisible();
  const settled = readOmpTaskProgress({
    details: {
      op: "wait",
      jobs: [
        ...jobs.slice(0, 2),
        { ...jobs[2], status: "completed", resultText: "Mining complete" },
        jobs[3],
        {
          id: "Shell",
          type: "bash",
          status: "failed",
          label: "Check files",
          durationMs: 1000,
          exitCode: 1,
          errorText: "Command failed",
        },
      ],
    },
  });
  if (!settled) throw new Error("Expected native settled snapshot");
  await screen.rerender(<OmpTaskProgressDisplay progress={settled} />);
  await expect.element(screen.getByText("Mining complete", { exact: true })).toBeVisible();
  await screen.getByText("Check files", { exact: true }).click();
  await expect.element(screen.getByText("Exit code: 1", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Command failed", { exact: true })).toBeVisible();
});
