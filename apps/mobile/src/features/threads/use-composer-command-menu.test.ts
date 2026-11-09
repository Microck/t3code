import { describe, expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

vi.mock("../../state/queries", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
  useComposerPullRequestSearch: () => ({ entries: [], isPending: false, error: null }),
}));
vi.mock("../../state/use-composer-drafts", () => ({
  getComposerDraftSnapshot: vi.fn(),
  setComposerDraftContext: vi.fn(),
  useComposerDraftSelection: vi.fn(),
}));
vi.mock("../../lib/uuid", () => ({ uuidv4: () => "context-id" }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providersValueAtom: vi.fn(),
    refreshProviders: Symbol("refreshProviders"),
  },
}));

import {
  buildComposerSlashCommandItems,
  resolveComposerCommandSelection,
  resolveComposerMenuSelection,
} from "./use-composer-command-menu";

describe("resolveComposerMenuSelection", () => {
  it("prefers the caret an insertion placed in the current draft text", () => {
    expect(
      resolveComposerMenuSelection({
        draftMessage: "hello @chip ",
        ownerKey: "draft-a",
        inserted: { start: 12, end: 12 },
        local: { ownerKey: "draft-a", start: 2, end: 2 },
      }),
    ).toEqual({ start: 12, end: 12 });
  });

  it("clamps the composer's own caret when the draft shrinks", () => {
    expect(
      resolveComposerMenuSelection({
        draftMessage: "hi",
        ownerKey: "draft-a",
        inserted: null,
        local: { ownerKey: "draft-a", start: 5, end: 9 },
      }),
    ).toEqual({ start: 2, end: 2 });
  });

  it("starts at the end of the draft after switching owners", () => {
    expect(
      resolveComposerMenuSelection({
        draftMessage: "other draft",
        ownerKey: "draft-b",
        inserted: null,
        local: { ownerKey: "draft-a", start: 1, end: 1 },
      }),
    ).toEqual({ start: 11, end: 11 });
  });
});

describe("mobile slash commands", () => {
  it("keeps a provider's native /plan", () => {
    const items = buildComposerSlashCommandItems({
      query: "pl",
      atMessageStart: true,
      hasThread: true,
      selectedProviderStatus: {
        driver: ProviderDriverKind.make("antigravity"),
        slashCommands: [{ name: "plan", description: "Plan with Antigravity" }],
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("provider-slash-command");
    const item = items[0];
    if (!item) throw new Error("Expected the native plan command");
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/pl",
        trigger: { rangeStart: 0, rangeEnd: 3 },
        item,
      }),
    ).toEqual({ text: "/plan ", cursor: 6 });
  });

  it("offers T3's /clear in place of the provider's, only at the message start", () => {
    const claude = {
      driver: ProviderDriverKind.make("claudeAgent"),
      slashCommands: [{ name: "clear", description: "Clear conversation history" }],
    };
    const build = (offersFreshSession: boolean, atMessageStart = true) =>
      buildComposerSlashCommandItems({
        query: "cle",
        atMessageStart,
        hasThread: true,
        offersFreshSession,
        selectedProviderStatus: claude,
      }).map((item) => item.id);
    expect(build(true)).toEqual(["cmd:clear"]);
    expect(build(false)).toEqual(["pcmd:clear"]);
    expect(build(true, false)).toEqual([]);
  });

  it.each(["Please use ", "Please use\n"])(
    "completes an advertised skill command after %j without replacing surrounding text",
    (prefix) => {
      const items = buildComposerSlashCommandItems({
        query: "",
        offersSideChat: true,
        offersFreshSession: true,
        atMessageStart: false,
        hasThread: true,
        selectedProviderStatus: {
          driver: ProviderDriverKind.make("acpRegistry"),
          slashCommands: [{ name: "skill:logo-archive" }, { name: "compact" }, { name: "clear" }],
        },
      });
      expect(items.map((item) => item.id)).toEqual(["cmd:model", "pcmd:skill:logo-archive"]);
      const item = items.find((entry) => entry.id === "pcmd:skill:logo-archive");
      if (!item) throw new Error("Expected the advertised skill command");
      const partial = "/skill:logo";
      const replacement = "/skill:logo-archive ";
      expect(
        resolveComposerCommandSelection({
          draftMessage: `${prefix}${partial}\nfor this logo`,
          trigger: { rangeStart: prefix.length, rangeEnd: prefix.length + partial.length },
          item,
        }),
      ).toEqual({
        text: `${prefix}${replacement}\nfor this logo`,
        cursor: prefix.length + replacement.length,
      });
    },
  );
});
