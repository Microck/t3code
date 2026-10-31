import { useAtomValue } from "@effect/atom-react";
import { cliReleaseTagUrl } from "@t3tools/shared/cliRelease";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { AsyncResult, Atom } from "effect/reactivity";

const Release = Schema.Struct({
  tag_name: Schema.String,
  draft: Schema.Boolean,
  assets: Schema.Array(Schema.Struct({ name: Schema.String })),
});

const decodeRelease = Schema.decodeUnknownEffect(Release);

export function decodeCliReleaseAssets(body: unknown, version: string) {
  return decodeRelease(body).pipe(
    Effect.map((release) =>
      !release.draft && release.tag_name === `v${version}`
        ? release.assets.map((asset) => asset.name)
        : [],
    ),
  );
}

const cliReleaseAssetsAtom = Atom.family((version: string) =>
  Atom.make(
    Effect.gen(function* () {
      const response = yield* HttpClient.get(cliReleaseTagUrl(version));
      if (response.status === 404) return [];
      const body = yield* HttpClientResponse.filterStatusOk(response).pipe(
        Effect.flatMap((ok) => ok.json),
      );
      return yield* decodeCliReleaseAssets(body, version);
    }).pipe(
      // Public release checks need no tracing headers or CORS preflight.
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      Effect.provide(FetchHttpClient.layer),
    ),
  ).pipe(
    Atom.withRefresh("5 minutes"),
    Atom.keepAlive,
    Atom.withLabel(`cli-release-assets:${version}`),
  ),
);

const NO_VERSION_ATOM = Atom.make(AsyncResult.success<string[]>([])).pipe(
  Atom.withLabel("cli-release-assets:none"),
);

export function useCliReleaseAssets(version: string | null): ReadonlyArray<string> {
  const result = useAtomValue(version ? cliReleaseAssetsAtom(version) : NO_VERSION_ATOM);
  return AsyncResult.getOrElse(result, () => []);
}
