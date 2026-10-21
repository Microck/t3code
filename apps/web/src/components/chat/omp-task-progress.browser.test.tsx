import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";
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
    resolvedModel: "luna",
    resolvedModelIdentity: "openai-codex/gpt-6-luna",
    completionPercent: 42,
  };
  const progress: OmpTaskProgress = { agents: [agent], text: null };
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
