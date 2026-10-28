import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { mergePathEntries } from "@t3tools/shared/shell";
import {
  makeManualOnlyProviderMaintenanceCapabilities,
  makeProviderMaintenanceCapabilities,
  runProbe,
  type ProviderMaintenanceCapabilitiesResolver,
  type ProviderMaintenanceResolverServices,
} from "@t3tools/provider-core/server/maintenanceResolver";

const VERSION = "(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)";

export function parseOmpVersion(output: string): string | null {
  return new RegExp(`^omp/${VERSION}$`).exec(output.trim())?.[1] ?? null;
}

export function parseOmpUpdateCheck(output: string): string | null {
  output = output.replaceAll("\r\n", "\n");
  const latest = new RegExp(`^New version available: ${VERSION}$`, "m").exec(output)?.[1];
  if (latest) return latest;
  return output.includes("Already up to date")
    ? (new RegExp(`^Current version: ${VERSION}$`, "m").exec(output)?.[1] ?? null)
    : null;
}

export function ompMaintenance(cwd: string): ProviderMaintenanceCapabilitiesResolver {
  return {
    resolve: Effect.fn("OmpMaintenance.resolve")(function* (context) {
      const provider = ProviderDriverKind.make("acpRegistry");
      if (!context)
        return makeManualOnlyProviderMaintenanceCapabilities({ provider, packageName: null });
      const services = yield* Effect.context<ProviderMaintenanceResolverServices>();
      const path = yield* Path.Path;
      // OMP resolves the installation to update through PATH, even when invoked by absolute path.
      const env = {
        ...Object.fromEntries(
          Object.entries(context.env).filter(([key]) => key.toUpperCase() !== "PATH"),
        ),
        PATH: mergePathEntries(
          path.dirname(context.resolvedCommandPath),
          context.env.PATH ?? context.env.Path ?? context.env.path,
          context.platform,
        ),
        NO_COLOR: "1",
      };
      // ACP arguments belong to the session. The updater resolves its own native
      // settings, including the persisted channel, from this same environment/cwd.
      const capabilities = makeProviderMaintenanceCapabilities({
        provider,
        packageName: null,
        updateExecutable: context.resolvedCommandPath,
        updateArgs: ["update"],
        updateLockKey: `omp:${context.realCommandPath}`,
        env,
        platform: context.platform,
        latestVersion: null,
        lookupLatestVersion: runProbe(
          context.resolvedCommandPath,
          ["update", "--check"],
          env,
          [0],
          cwd,
        ).pipe(
          Effect.map((output) => (output === null ? null : parseOmpUpdateCheck(output))),
          Effect.provideContext(services),
        ),
      });
      return {
        ...capabilities,
        update: capabilities.update && {
          ...capabilities.update,
          cwd,
          env,
        },
      };
    }),
  };
}
