import { Effect, Layer } from "effect";
import { WS_METHODS, WsRpcGroup } from "@t3tools/contracts";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { ServerConfig } from "./config";
import { Keybindings } from "./keybindings";
import { resolveAvailableEditors } from "./open";
import { ProviderHealth } from "./provider/Services/ProviderHealth";

const WsRpcLayer = WsRpcGroup.toLayer({
  [WS_METHODS.serverGetConfig]: () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      const keybindings = yield* Keybindings;
      const providerHealth = yield* ProviderHealth;
      const keybindingsConfig = yield* keybindings.loadConfigState.pipe(Effect.orDie);
      const providers = yield* providerHealth.getStatuses;

      return {
        cwd: config.cwd,
        keybindingsConfigPath: config.keybindingsConfigPath,
        keybindings: keybindingsConfig.keybindings,
        issues: keybindingsConfig.issues,
        providers,
        availableEditors: resolveAvailableEditors(),
      };
    }),
});

export const websocketRpcRouteLayer = RpcServer.layerHttp({
  group: WsRpcGroup,
  path: "/ws",
  protocol: "websocket",
}).pipe(Layer.provide(WsRpcLayer), Layer.provide(RpcSerialization.layerJson));
