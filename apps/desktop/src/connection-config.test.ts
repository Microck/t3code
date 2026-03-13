import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DesktopConnectionConfigError,
  buildDesktopRemoteWsUrl,
  getDefaultDesktopConnectionSettings,
  readDesktopConnectionSettings,
  resolveDesktopConnectionSettingsFromArgs,
  resolveDesktopConnectionConfigPath,
  normalizeTailscaleUrl,
  validateDesktopConnectionSettings,
  writeDesktopConnectionSettings,
} from "./connection-config";

describe("connection-config", () => {
  it("returns local defaults when no config exists", () => {
    const configPath = Path.join(process.cwd(), "missing", "desktop-connection.json");

    expect(readDesktopConnectionSettings(configPath)).toEqual(getDefaultDesktopConnectionSettings());
  });

  it("builds a websocket url from a remote http url", () => {
    expect(
      buildDesktopRemoteWsUrl({
        mode: "remote",
        remoteUrl: "http://100.64.0.10:3773",
        remoteAuthToken: "secret token",
      }),
    ).toBe("ws://100.64.0.10:3773/?token=secret+token");
  });

  it("builds a secure websocket url from a remote https url", () => {
    expect(
      buildDesktopRemoteWsUrl({
        mode: "remote",
        remoteUrl: "https://example.com/t3",
        remoteAuthToken: "abc123",
      }),
    ).toBe("wss://example.com/?token=abc123");
  });

  it("rejects missing remote values in remote mode", () => {
    expect(() =>
      validateDesktopConnectionSettings({
        mode: "remote",
        remoteUrl: "",
        remoteAuthToken: "",
      }),
    ).toThrow(DesktopConnectionConfigError);
  });

  it("writes validated settings to disk", () => {
    const tempRoot = FS.mkdtempSync(Path.join(OS.tmpdir(), "t3code-connection-config-"));
    const configPath = resolveDesktopConnectionConfigPath(tempRoot);

    const saved = writeDesktopConnectionSettings(configPath, {
      mode: "remote",
      remoteUrl: "http://100.64.0.10:3773",
      remoteAuthToken: "abc123",
    });

    expect(saved).toEqual({
      mode: "remote",
      remoteUrl: "http://100.64.0.10:3773/",
      remoteAuthToken: "abc123",
    });
    expect(readDesktopConnectionSettings(configPath)).toEqual(saved);
  });

  it("normalizes a tailscale host shorthand to the default remote url", () => {
    expect(normalizeTailscaleUrl("100.64.0.10")).toBe("http://100.64.0.10:3773/");
  });

  it("resolves a remembered remote connection from tailscale launch args", () => {
    expect(
      resolveDesktopConnectionSettingsFromArgs(["--tailscale", "100.64.0.10", "--token", "abc123"]),
    ).toEqual({
      mode: "remote",
      remoteUrl: "http://100.64.0.10:3773/",
      remoteAuthToken: "abc123",
    });
  });

  it("supports explicit remote urls from launch args", () => {
    expect(
      resolveDesktopConnectionSettingsFromArgs([
        "--remote-url=https://example.com/t3",
        "--remote-auth-token=xyz",
      ]),
    ).toEqual({
      mode: "remote",
      remoteUrl: "https://example.com/t3",
      remoteAuthToken: "xyz",
    });
  });

  it("switches back to local mode from launch args", () => {
    expect(resolveDesktopConnectionSettingsFromArgs(["--local"])).toEqual(
      getDefaultDesktopConnectionSettings(),
    );
  });

  it("rejects incomplete tailscale launch args", () => {
    expect(() => resolveDesktopConnectionSettingsFromArgs(["--tailscale", "100.64.0.10"])).toThrow(
      DesktopConnectionConfigError,
    );
  });
});
