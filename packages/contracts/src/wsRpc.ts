import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { ServerConfig } from "./server";
import { WS_METHODS } from "./ws";

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  success: ServerConfig,
});

export const WsRpcGroup = RpcGroup.make(WsServerGetConfigRpc);
