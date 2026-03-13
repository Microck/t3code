import * as FS from "node:fs";
import * as Path from "node:path";

import type {
  DesktopConnectionInfo,
  DesktopConnectionMode,
  DesktopConnectionSettings,
} from "@t3tools/contracts";

export class DesktopConnectionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesktopConnectionConfigError";
  }
}

const CONNECTION_CONFIG_FILENAME = "desktop-connection.json";
const DEFAULT_REMOTE_PORT = "3773";

export function getDefaultDesktopConnectionSettings(): DesktopConnectionSettings {
  return {
    mode: "local",
    remoteUrl: "",
    remoteAuthToken: "",
  };
}

function normalizeMode(value: unknown): DesktopConnectionMode {
  return value === "remote" ? "remote" : "local";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sanitizeDesktopConnectionSettings(value: unknown): DesktopConnectionSettings {
  if (!value || typeof value !== "object") {
    return getDefaultDesktopConnectionSettings();
  }

  const record = value as Record<string, unknown>;
  return {
    mode: normalizeMode(record.mode),
    remoteUrl: normalizeString(record.remoteUrl),
    remoteAuthToken: normalizeString(record.remoteAuthToken),
  };
}

export function validateDesktopConnectionSettings(
  input: DesktopConnectionSettings,
): DesktopConnectionSettings {
  const settings = sanitizeDesktopConnectionSettings(input);
  if (settings.mode === "local") {
    return settings;
  }

  if (settings.remoteUrl.length === 0) {
    throw new DesktopConnectionConfigError("Remote URL is required.");
  }
  if (settings.remoteAuthToken.length === 0) {
    throw new DesktopConnectionConfigError("Remote auth token is required.");
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(settings.remoteUrl);
  } catch {
    throw new DesktopConnectionConfigError("Remote URL must be a valid http:// or https:// URL.");
  }

  if (remoteUrl.protocol !== "http:" && remoteUrl.protocol !== "https:") {
    throw new DesktopConnectionConfigError("Remote URL must use http:// or https://.");
  }
  if (!remoteUrl.hostname) {
    throw new DesktopConnectionConfigError("Remote URL must include a host.");
  }

  return {
    ...settings,
    remoteUrl: remoteUrl.toString(),
  };
}

function withDefaultHttpScheme(value: string): string {
  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }
  return `http://${value}`;
}

export function normalizeTailscaleUrl(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) {
    throw new DesktopConnectionConfigError("Tailscale host is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(withDefaultHttpScheme(raw));
  } catch {
    throw new DesktopConnectionConfigError(
      "Tailscale host must be a valid host, host:port, or http(s) URL.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DesktopConnectionConfigError("Tailscale host must use http:// or https://.");
  }
  if (!parsed.hostname) {
    throw new DesktopConnectionConfigError("Tailscale host must include a host.");
  }
  if (parsed.port.length === 0 && parsed.protocol === "http:") {
    parsed.port = DEFAULT_REMOTE_PORT;
  }

  return parsed.toString();
}

function readFlagValue(argv: readonly string[], index: number, argument: string): string | undefined {
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex >= 0) {
    const inlineValue = argument.slice(equalsIndex + 1).trim();
    return inlineValue.length > 0 ? inlineValue : "";
  }
  return argv[index + 1];
}

export function resolveDesktopConnectionSettingsFromArgs(
  argv: readonly string[],
): DesktopConnectionSettings | null {
  let forceLocal = false;
  let remoteUrl: string | null = null;
  let remoteAuthToken: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument || !argument.startsWith("--")) {
      continue;
    }

    if (argument === "--local") {
      forceLocal = true;
      continue;
    }

    if (argument === "--tailscale" || argument.startsWith("--tailscale=")) {
      const value = readFlagValue(argv, index, argument);
      if (value === undefined) {
        throw new DesktopConnectionConfigError("Missing value for --tailscale.");
      }
      remoteUrl = normalizeTailscaleUrl(value);
      if (!argument.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (argument === "--remote-url" || argument.startsWith("--remote-url=")) {
      const value = readFlagValue(argv, index, argument);
      if (value === undefined) {
        throw new DesktopConnectionConfigError("Missing value for --remote-url.");
      }
      remoteUrl = value;
      if (!argument.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (
      argument === "--token" ||
      argument.startsWith("--token=") ||
      argument === "--remote-auth-token" ||
      argument.startsWith("--remote-auth-token=")
    ) {
      const value = readFlagValue(argv, index, argument);
      if (value === undefined) {
        throw new DesktopConnectionConfigError(`Missing value for ${argument.split("=")[0]}.`);
      }
      remoteAuthToken = value;
      if (!argument.includes("=")) {
        index += 1;
      }
    }
  }

  if (forceLocal) {
    return getDefaultDesktopConnectionSettings();
  }

  if (remoteUrl === null && remoteAuthToken === null) {
    return null;
  }

  return validateDesktopConnectionSettings({
    mode: "remote",
    remoteUrl: remoteUrl ?? "",
    remoteAuthToken: (remoteAuthToken ?? "").trim(),
  });
}

export function buildDesktopRemoteWsUrl(settings: DesktopConnectionSettings): string {
  const validated = validateDesktopConnectionSettings(settings);
  if (validated.mode !== "remote") {
    throw new DesktopConnectionConfigError("Remote WebSocket URL is only available in remote mode.");
  }

  const remoteUrl = new URL(validated.remoteUrl);
  remoteUrl.protocol = remoteUrl.protocol === "https:" ? "wss:" : "ws:";
  remoteUrl.pathname = "/";
  remoteUrl.search = "";
  remoteUrl.searchParams.set("token", validated.remoteAuthToken);
  remoteUrl.hash = "";
  return remoteUrl.toString();
}

export function getDesktopConnectionInfo(
  settings: DesktopConnectionSettings,
): DesktopConnectionInfo {
  return { mode: settings.mode };
}

export function resolveDesktopConnectionConfigPath(userDataPath: string): string {
  return Path.join(userDataPath, CONNECTION_CONFIG_FILENAME);
}

export function readDesktopConnectionSettings(configPath: string): DesktopConnectionSettings {
  try {
    const raw = FS.readFileSync(configPath, "utf8");
    return sanitizeDesktopConnectionSettings(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return getDefaultDesktopConnectionSettings();
    }
    throw error;
  }
}

export function writeDesktopConnectionSettings(
  configPath: string,
  input: DesktopConnectionSettings,
): DesktopConnectionSettings {
  const settings = validateDesktopConnectionSettings(input);
  FS.mkdirSync(Path.dirname(configPath), { recursive: true });
  FS.writeFileSync(configPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  return settings;
}
