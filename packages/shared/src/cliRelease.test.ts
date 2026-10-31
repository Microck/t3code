import { describe, expect, it } from "vite-plus/test";

import {
  cliArchiveTarCommand,
  cliReleaseHasArchive,
  cliReleaseTagUrl,
  newestCliReleaseVersion,
  parseChecksums,
} from "./cliRelease.ts";

describe("cliRelease", () => {
  it("requires the matching platform archive and checksums from the selected distribution", () => {
    const version = "0.1.2-nightly.20261021.347300006";
    const assets = [`t3-${version}-linux-arm64.tar.gz`, "SHA256SUMS"];
    expect(cliReleaseHasArchive(assets, version, { os: "linux", arch: "arm64" })).toBe(true);
    expect(cliReleaseHasArchive(assets, version, { os: "linux", arch: "x64" })).toBe(false);
    expect(cliReleaseHasArchive(assets.slice(0, 1), version, { os: "linux", arch: "arm64" })).toBe(
      false,
    );
    expect(cliReleaseHasArchive(assets, "1.0.0", { os: "linux", arch: "arm64" })).toBe(false);
    expect(
      cliReleaseHasArchive([`t3-${version}-win32-x64.zip`, "SHA256SUMS"], version, {
        os: "windows",
        arch: "x64",
      }),
    ).toBe(true);
    expect(cliReleaseHasArchive(assets, version, { os: "unknown", arch: "other" })).toBe(false);
    expect(cliReleaseTagUrl(version)).toMatch(`/releases/tags/v${version}`);
  });
  it("parses sha256sum output including binary-mode markers", () => {
    const checksums = parseChecksums(
      [
        `${"a".repeat(64)}  t3-1.2.3-linux-x64.tar.gz`,
        `${"B".repeat(64)} *t3-1.2.3-win32-x64.zip`,
        "not a checksum line",
        "",
      ].join("\n"),
    );
    expect(checksums.get("t3-1.2.3-linux-x64.tar.gz")).toBe("a".repeat(64));
    expect(checksums.get("t3-1.2.3-win32-x64.zip")).toBe("b".repeat(64));
    expect(checksums.size).toBe(2);
  });

  it("extracts with the System32 bsdtar on Windows and plain tar elsewhere", () => {
    expect(cliArchiveTarCommand("linux", {})).toBe("tar");
    expect(cliArchiveTarCommand("win32", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\tar.exe",
    );
    expect(cliArchiveTarCommand("win32", {})).toBe("C:\\Windows\\System32\\tar.exe");
  });

  it("picks the newest non-draft release on the requested channel", () => {
    const releases = [
      { tag_name: "v1.2.4-preview.20260912.9", draft: true },
      { tag_name: "v1.2.4-preview.20260912.8" },
      { tag_name: "v1.2.4-nightly.20260912.7" },
      { tag_name: "desktop-preview" },
      { tag_name: "v1.2.3" },
      { tag_name: "v1.2.3-nightly.20260911.2" },
    ];
    expect(newestCliReleaseVersion(releases, "preview")).toBe("1.2.4-preview.20260912.8");
    expect(newestCliReleaseVersion(releases, "nightly")).toBe("1.2.4-nightly.20260912.7");
    expect(newestCliReleaseVersion(releases, "stable")).toBe("1.2.3");
    expect(newestCliReleaseVersion([{ tag_name: "v1.2.3" }], "preview")).toBeUndefined();
  });
});
