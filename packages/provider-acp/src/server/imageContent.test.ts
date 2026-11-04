import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as AcpSchema from "effect-acp/compat";
import { MAX_TOOL_OUTPUT_IMAGE_BASE64_LENGTH } from "@t3tools/shared/toolOutput";
import { materializeAcpImages } from "./imageContent.ts";
import { acpContentBlockDisplayText, parseSessionUpdateEvent } from "./runtimeModel.ts";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const image = { type: "image", mimeType: "image/png", data: png } as const;

it.effect(
  "persists native assistant and tool images before their binary payload is discarded",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temp = yield* fs.makeTempDirectoryScoped();
      const directory = path.join(temp, "images (from ACP)");
      const updates: AcpSchema.SessionNotification["update"][] = [
        { sessionUpdate: "agent_message_chunk", messageId: "message", content: image },
        { sessionUpdate: "agent_message", messageId: "message", content: [image] },
        {
          sessionUpdate: "tool_call",
          toolCallId: "tool",
          title: "Image",
          content: [{ type: "content", content: image }],
        },
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "tool",
          content: [{ type: "content", content: image }],
        },
        {
          sessionUpdate: "tool_call_content_chunk",
          toolCallId: "tool",
          content: { type: "content", content: image },
        },
      ];
      let markdown = "";
      for (const update of updates) {
        const notification = yield* materializeAcpImages(
          { sessionId: "session", update },
          directory,
        );
        const serialized = JSON.stringify(notification);
        expect(serialized).toContain("![ACP image](<");
        expect(serialized).not.toContain(png);
        expect(serialized).not.toContain("data:image");
        // Tool calls use the runtime model; message chunks are projected directly by the adapter.
        if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
          expect(JSON.stringify(parseSessionUpdateEvent(notification))).toContain("![ACP image](<");
        }
        if (notification.update.sessionUpdate === "agent_message_chunk") {
          markdown = acpContentBlockDisplayText(notification.update.content) ?? "";
        }
      }
      const files = yield* fs.readDirectory(directory);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^acp-[a-f0-9]{64}\.png$/);
      expect(
        Buffer.from(yield* fs.readFile(path.join(directory, files[0]!))).toString("base64"),
      ).toBe(png);
      expect(markdown).toContain(path.join(directory, files[0]!).replaceAll("\\", "/"));
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.effect("keeps unsupported images and invalid bytes on the bounded placeholder path", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped();
    for (const invalid of [
      { ...image, mimeType: "image/svg+xml" },
      { ...image, data: "not base64" },
      { ...image, data: "A".repeat(MAX_TOOL_OUTPUT_IMAGE_BASE64_LENGTH + 4) },
      { ...image, data: "", uri: "https://example.com/image.png" },
    ]) {
      const input: AcpSchema.SessionNotification = {
        sessionId: "session",
        update: { sessionUpdate: "agent_message_chunk", messageId: "message", content: invalid },
      };
      const output = yield* materializeAcpImages(input, directory);
      expect(output).toEqual(input);
      expect(acpContentBlockDisplayText(invalid)).toContain("[ACP image (");
    }
    expect(yield* fs.readDirectory(directory)).toEqual([]);
    const input: AcpSchema.SessionNotification = {
      sessionId: "session",
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "message",
        content: { type: "text", text: "Existing **Markdown**" },
      },
    };
    expect(yield* materializeAcpImages(input, directory)).toEqual(input);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);
