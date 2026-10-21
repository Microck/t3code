import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { decodeCliReleaseAssets } from "./cli-release";

const version = "0.1.2-nightly.20261021.347300006";
const release = {
  tag_name: `v${version}`,
  draft: false,
  assets: [{ name: "SHA256SUMS" }, { name: `t3-${version}-linux-arm64.tar.gz` }],
};

it.effect("reads fork release assets without requiring an npm publication", () =>
  Effect.gen(function* () {
    expect(yield* decodeCliReleaseAssets(release, version)).toEqual(
      release.assets.map((asset) => asset.name),
    );
  }),
);
it.effect("does not offer draft releases or assets belonging to another version", () =>
  Effect.gen(function* () {
    expect(yield* decodeCliReleaseAssets({ ...release, draft: true }, version)).toEqual([]);
    expect(yield* decodeCliReleaseAssets(release, "1.0.0")).toEqual([]);
  }),
);
it.effect("rejects malformed release responses at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      (yield* Effect.exit(decodeCliReleaseAssets({ assets: ["not an asset"] }, version)))._tag,
    ).toBe("Failure");
  }),
);
