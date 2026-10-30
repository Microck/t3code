// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as AcpSchema from "effect-acp/compat";
import {
  MAX_TOOL_OUTPUT_IMAGE_BASE64_LENGTH,
  readToolOutputImage,
} from "@t3tools/shared/toolOutput";

/** Materialize bytes before text projection; untraced because every streamed delta passes here. */
export const materializeAcpImages = Effect.fnUntraced(function* (
  notification: AcpSchema.SessionNotification,
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const content = Effect.fnUntraced(function* (block: AcpSchema.ContentBlock) {
    if (block.type !== "image") return block;
    const image = readToolOutputImage(block);
    const data = image?.data;
    // Never fetch agent-provided URLs or retain unsupported/oversized encoded payloads.
    if (
      image === null ||
      !data ||
      data.length > MAX_TOOL_OUTPUT_IMAGE_BASE64_LENGTH ||
      data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      return block;
    const bytes = Buffer.from(data, "base64");
    const digest = NodeCrypto.createHash("sha256").update(bytes).digest("hex");
    const file = NodePath.join(directory, `acp-${digest}.${image.mimeType.slice(6)}`);
    // Generated output artifacts outlive chats; they are not temporary upload attachments.
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* fs.writeFile(file, bytes);
    return {
      type: "text" as const,
      text: `\n\n![ACP image](<${file.replaceAll("\\", "/")}>)\n\n`,
    };
  });
  const toolContent = Effect.fnUntraced(function* (entry: AcpSchema.ToolCallContent) {
    if (entry.type !== "content") return entry;
    return { ...entry, content: yield* content(entry.content) };
  });
  const update = notification.update;
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return { ...notification, update: { ...update, content: yield* content(update.content) } };
    case "agent_message":
      return update.content == null
        ? notification
        : {
            ...notification,
            update: { ...update, content: yield* Effect.forEach(update.content, content) },
          };
    case "tool_call":
    case "tool_call_update":
      return update.content === undefined || update.content === null
        ? notification
        : {
            ...notification,
            update: { ...update, content: yield* Effect.forEach(update.content, toolContent) },
          };
    case "tool_call_content_chunk":
      return {
        ...notification,
        update: { ...update, content: yield* toolContent(update.content) },
      };
    default:
      return notification;
  }
});
