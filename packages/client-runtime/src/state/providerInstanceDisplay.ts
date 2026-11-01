import {
  defaultInstanceIdForDriver,
  PROVIDER_DISPLAY_NAMES,
  type ProviderDriverKind,
  type ServerProvider,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";

/** Local ACP commands have no registry identity; labels can be renamed. */
export function isOmpProvider(
  instance: Pick<ProviderInstanceConfig, "driver" | "config"> | undefined,
): boolean {
  if (instance?.driver !== "acpRegistry") return false;
  const config = instance.config;
  return (
    typeof config === "object" &&
    config !== null &&
    "source" in config &&
    config.source === "local" &&
    "commandPath" in config &&
    typeof config.commandPath === "string" &&
    /^omp(?:\.exe|\.cmd|\.bat)?$/i.test(config.commandPath.split(/[\\/]/).at(-1) ?? "") &&
    "commandArgs" in config &&
    Array.isArray(config.commandArgs) &&
    config.commandArgs[0] === "acp"
  );
}

/** Resolve the model family, not its gateway. Opaque custom IDs retain the agent icon. */
export function ompModelIcon(
  model: string | undefined,
): "codex" | "claudeAgent" | "gemini" | "grok" | null {
  const id = model?.trim().toLowerCase().split("/").at(-1) ?? "";
  if (/^(?:gpt[-.]|o\d(?:[-.]|$)|codex(?:[-.]|$))/.test(id)) return "codex";
  if (/^claude[-.]/.test(id)) return "claudeAgent";
  if (/^gemini[-.]/.test(id)) return "gemini";
  if (/^grok[-.]/.test(id)) return "grok";
  return null;
}

export const MODEL_ICON_LABELS = {
  codex: "OpenAI",
  claudeAgent: "Anthropic",
  gemini: "Google Gemini",
  grok: "xAI",
} as const;

// Google Gemini mark from Simple Icons (CC0), shared by web and native rendering.
export const GEMINI_ICON_PATH =
  "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81";

function humanizeSlug(slug: string): string {
  return slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveProviderInstanceDisplayName(
  snapshot: Pick<ServerProvider, "instanceId" | "driver" | "displayName">,
): string {
  const trimmedSnapshotName = snapshot.displayName?.trim();
  const kindLabel = PROVIDER_DISPLAY_NAMES[snapshot.driver] ?? humanizeSlug(snapshot.driver);
  if (trimmedSnapshotName && trimmedSnapshotName !== kindLabel) return trimmedSnapshotName;
  if (snapshot.instanceId !== defaultInstanceIdForDriver(snapshot.driver)) {
    const humanized = humanizeSlug(snapshot.instanceId);
    if (humanized.length > 0) return humanized;
  }
  return trimmedSnapshotName || kindLabel;
}

export function providerInstanceInitials(label: string): string {
  // Punctuation separates words so "Codex (hub)" reads CH, not C(. An apostrophe
  // inside a word stays ("Theo's Codex" is TC); a quoting one does not
  // ("Codex 'hub'" is CH).
  const words = label
    .replace(/[^\P{P}'’]+/gu, " ")
    .split(/\s+/u)
    .map((word) => word.replace(/^['’]+|['’]+$/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join("").toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}

export function normalizeProviderAccentColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed : undefined;
}

export function providerAccentForegroundColor(accentColor: string) {
  const linearChannel = (offset: number) => {
    const value = Number.parseInt(accentColor.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * linearChannel(1) + 0.7152 * linearChannel(3) + 0.0722 * linearChannel(5);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

export function shouldShowInstanceBadge(
  entry: {
    readonly driverKind: ProviderDriverKind;
    readonly accentColor?: string | undefined;
    readonly acpRegistryAgentId?: string | undefined;
    readonly enabled: boolean;
  },
  entries: Iterable<{
    readonly driverKind: ProviderDriverKind;
    readonly acpRegistryAgentId?: string | undefined;
    readonly enabled: boolean;
  }>,
): boolean {
  if (entry.accentColor) return true;
  let sharedProviderCount = 0;
  for (const candidate of entries) {
    if (candidate.driverKind !== entry.driverKind) continue;
    // Historical threads still need to distinguish accounts that are all disabled.
    if (entry.enabled && !candidate.enabled) continue;
    if (
      entry.driverKind === "acpRegistry" &&
      candidate.acpRegistryAgentId !== entry.acpRegistryAgentId
    ) {
      continue;
    }
    if (++sharedProviderCount > 1) return true;
  }
  return false;
}
