import { describe, expect, it } from "@effect/vitest";
import { officialNightly, personalVersion } from "./personal-release.ts";

describe("personal release selection", () => {
  it("ignores drafts, stable releases and maintainer previews", () => {
    const nightly = { tag_name: "v0.1.2-nightly.20261021.3473", draft: false };
    expect(
      officialNightly([
        { tag_name: "v0.1.2-preview.20261021.9999", draft: false },
        { tag_name: "v0.1.2-nightly.20261021.9998", draft: true },
        { tag_name: "v0.1.2", draft: false },
        nightly,
      ]),
    ).toBe(nightly);
    expect(() => officialNightly([])).toThrow("No official nightly found");
  });

  it("keeps upstream and fork runtimes separate and orders later builds correctly", () => {
    const first = personalVersion("0.1.2-nightly.20261021.3473", 1);
    const rebuild = personalVersion("0.1.2-nightly.20261021.3473", 2);
    const update = personalVersion("0.1.2-nightly.20261021.3474", 3);
    expect(first).toBe("0.1.2-nightly.20261021.347300001");
    expect(BigInt(rebuild.split(".").at(-1)!)).toBeGreaterThan(BigInt(first.split(".").at(-1)!));
    expect(BigInt(update.split(".").at(-1)!)).toBeGreaterThan(BigInt(rebuild.split(".").at(-1)!));
  });

  it.each([0, -1, 1.5, 100_000, Number.NaN])("rejects an invalid run number %s", (run) => {
    expect(() => personalVersion("0.1.2-nightly.20261021.3473", run)).toThrow();
  });

  it.each(["0.1.2", "0.1.2-preview.20261021.3473", "../v0.1.2", "v0.1.2-nightly.20261021.3473"])(
    "rejects a non-nightly or unsafe version %s",
    (version) => expect(() => personalVersion(version, 1)).toThrow(),
  );
});
