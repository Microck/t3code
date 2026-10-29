import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isOmpProvider,
  ompModelIcon,
  normalizeProviderAccentColor,
  providerAccentForegroundColor,
  providerInstanceInitials,
  shouldShowInstanceBadge,
} from "./providerInstanceDisplay.ts";

const codex = ProviderDriverKind.make("codex");
const acpRegistry = ProviderDriverKind.make("acpRegistry");

describe("providerInstanceInitials", () => {
  it("treats punctuation as a word break but keeps apostrophes between letters", () => {
    expect(providerInstanceInitials("Codex (hub)")).toBe("CH");
    expect(providerInstanceInitials("work_codex")).toBe("WC");
    expect(providerInstanceInitials("Theo's Codex")).toBe("TC");
    expect(providerInstanceInitials("Codex 'hub'")).toBe("CH");
    expect(providerInstanceInitials("‘hub’")).toBe("HU");
    expect(providerInstanceInitials("(hub)")).toBe("HU");
  });

  it("keeps an emoji whole instead of splitting its surrogate pair", () => {
    expect(providerInstanceInitials("😀 Work")).toBe("😀W");
    expect(providerInstanceInitials("😀")).toBe("😀");
  });
});

describe("normalizeProviderAccentColor", () => {
  // regression: #9899 a non-hex accent must not render as the account badge color
  it("rejects a non-hex value", () => {
    expect(normalizeProviderAccentColor("blue")).toBeUndefined();
  });
});

describe("providerAccentForegroundColor", () => {
  it.each([
    ["#b5f23d", "#000000"],
    ["#2563eb", "#ffffff"],
    ["#777777", "#000000"],
  ])("chooses the higher WCAG contrast foreground for %s", (accent, foreground) => {
    expect(providerAccentForegroundColor(accent)).toBe(foreground);
  });
});

describe("shouldShowInstanceBadge", () => {
  it("hides badges for distinct ACP agents sharing the registry driver", () => {
    const mistral = { driverKind: acpRegistry, acpRegistryAgentId: "mistral-vibe", enabled: true };
    const devin = { driverKind: acpRegistry, acpRegistryAgentId: "devin", enabled: true };
    expect(shouldShowInstanceBadge(mistral, [mistral, devin])).toBe(false);
    expect(shouldShowInstanceBadge(devin, [mistral, devin])).toBe(false);
  });

  it("distinguishes registry instances whose agent identity is unavailable", () => {
    const entry = { driverKind: acpRegistry, enabled: true };
    expect(shouldShowInstanceBadge(entry, [entry, { ...entry }])).toBe(true);
  });

  it("shows the badge when the entry has an accent color", () => {
    const entry = { driverKind: codex, accentColor: "#ff8800", enabled: true };
    expect(shouldShowInstanceBadge(entry, [entry])).toBe(true);
  });

  it("shows the badge when two entries share a driver, even without an accent", () => {
    const first = { driverKind: codex, accentColor: undefined, enabled: true };
    const second = { driverKind: codex, accentColor: undefined, enabled: true };
    expect(shouldShowInstanceBadge(first, [first, second])).toBe(true);
  });

  it("ignores disabled siblings for enabled instances while distinguishing historical owners", () => {
    const enabled = { driverKind: codex, enabled: true };
    const disabled = { driverKind: codex, enabled: false };

    expect(shouldShowInstanceBadge(enabled, [enabled, disabled])).toBe(false);
    expect(shouldShowInstanceBadge(disabled, [enabled, disabled])).toBe(true);
    expect(shouldShowInstanceBadge(disabled, [disabled, { ...disabled }])).toBe(true);
    expect(shouldShowInstanceBadge(disabled, [disabled])).toBe(false);
  });
});

describe("OMP model identity", () => {
  it.each([
    ["openai-codex/gpt-6.1-sol", "codex"],
    ["maisa-codex/gpt-daybreak-blue-latest", "codex"],
    ["openrouter/anthropic/claude-opus-5.5", "claudeAgent"],
    ["google-antigravity/claude-sonnet-5", "claudeAgent"],
    ["google/gemini-3-pro", "gemini"],
    ["xai/grok-4", "grok"],
    ["o3", "codex"],
    ["opaque-custom-model", null],
    ["openai-codex/unknown", null],
    [undefined, null],
  ] as const)("uses the actual model family for %s", (model, icon) => {
    expect(ompModelIcon(model)).toBe(icon);
  });
  it("recognizes local OMP configuration independently of the display name", () => {
    const instance = {
      driver: acpRegistry,
      config: {
        source: "local",
        commandPath: "C:\\tools\\omp.cmd",
        commandArgs: ["acp", "--config", "profile.yml"],
      },
    };
    expect(isOmpProvider(instance)).toBe(true);
    expect(
      isOmpProvider({ ...instance, config: { ...instance.config, commandPath: "other" } }),
    ).toBe(false);
    expect(isOmpProvider({ ...instance, config: { ...instance.config, commandArgs: [] } })).toBe(
      false,
    );
    expect(isOmpProvider({ ...instance, driver: codex })).toBe(false);
  });
});
