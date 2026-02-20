import { EventEmitter } from "node:events";
import type {
  AppSettings,
  AppSettingsUpdateInput,
  ProjectAddInput,
  ProjectAddResult,
  ProjectListResult,
  ProjectRemoveInput,
  ProjectUpdateScriptsInput,
  ProjectUpdateScriptsResult,
  StateBootstrapResult,
  StateCatchUpInput,
  StateCatchUpResult,
  StateEvent,
  StateListMessagesInput,
  StateListMessagesResult,
  ThreadsCreateInput,
  ThreadsDeleteInput,
  ThreadsMarkVisitedInput,
  ThreadsUpdateBranchInput,
  ThreadsUpdateModelInput,
  ThreadsUpdateResult,
  ThreadsUpdateTerminalStateInput,
  ThreadsUpdateTitleInput,
} from "@t3tools/contracts";
import { createLogger } from "./logger";
import type { LiveStoreStateMirror } from "./livestore/liveStoreEngine";
import { diffStateSnapshots } from "./livestore/parity";
import type { ApplyCheckpointRevertInput, StateSyncEngine } from "./stateSyncEngine";

interface LiveStoreReadPilotEvents {
  stateEvent: [event: StateEvent];
}

type LiveStoreReadSource = "delegate" | "livestore";

export interface LiveStoreReadPilotStateSyncEngineOptions {
  delegate: StateSyncEngine;
  mirror: LiveStoreStateMirror;
  enableBootstrapParityCheck?: boolean;
  enableCatchUpParityCheck?: boolean;
  enableListMessagesParityCheck?: boolean;
}

export class LiveStoreReadPilotStateSyncEngine
  extends EventEmitter<LiveStoreReadPilotEvents>
  implements StateSyncEngine
{
  private readonly delegate: StateSyncEngine;
  private readonly mirror: LiveStoreStateMirror;
  private readonly logger = createLogger("livestore-read-pilot");
  private readonly unsubscribeDelegate: () => void;
  private readonly enableBootstrapParityCheck: boolean;
  private readonly enableCatchUpParityCheck: boolean;
  private readonly enableListMessagesParityCheck: boolean;
  private closed = false;
  private bootstrapSource: LiveStoreReadSource = "delegate";
  private catchUpSource: LiveStoreReadSource = "delegate";
  private listMessagesSource: LiveStoreReadSource = "delegate";
  private bootstrapParityState: "unknown" | "in-parity" | "drift" = "unknown";
  private catchUpParityState: "unknown" | "in-parity" | "drift" = "unknown";
  private listMessagesParityState: "unknown" | "in-parity" | "drift" = "unknown";

  constructor(options: LiveStoreReadPilotStateSyncEngineOptions) {
    super();
    this.delegate = options.delegate;
    this.mirror = options.mirror;
    this.enableBootstrapParityCheck = options.enableBootstrapParityCheck ?? false;
    this.enableCatchUpParityCheck = options.enableCatchUpParityCheck ?? false;
    this.enableListMessagesParityCheck = options.enableListMessagesParityCheck ?? false;
    this.unsubscribeDelegate = this.delegate.onStateEvent((event) => {
      this.emit("stateEvent", event);
      void this.mirror.mirrorStateEvent(event).catch((error) => {
        this.logger.warn("failed to mirror state event in read pilot", {
          error,
          seq: event.seq,
        });
      });
    });
  }

  onStateEvent(listener: (event: StateEvent) => void): () => void {
    this.on("stateEvent", listener);
    return () => {
      this.off("stateEvent", listener);
    };
  }

  loadSnapshot(): StateBootstrapResult {
    try {
      const snapshot = this.mirror.debugReadSnapshot();
      if (snapshot.lastStateSeq > 0) {
        if (this.enableBootstrapParityCheck) {
          this.checkBootstrapParity(snapshot);
        }
        this.logReadSourceChange("state.bootstrap", this.bootstrapSource, "livestore", {
          lastStateSeq: snapshot.lastStateSeq,
        });
        this.bootstrapSource = "livestore";
        return snapshot;
      }
    } catch (error) {
      this.logger.warn("failed to read bootstrap from livestore mirror; using delegate", { error });
    }
    const snapshot = this.delegate.loadSnapshot();
    this.logReadSourceChange("state.bootstrap", this.bootstrapSource, "delegate", {
      lastStateSeq: snapshot.lastStateSeq,
    });
    this.bootstrapSource = "delegate";
    return snapshot;
  }

  private checkBootstrapParity(mirrorSnapshot: StateBootstrapResult): void {
    let delegateSnapshot: StateBootstrapResult;
    try {
      delegateSnapshot = this.delegate.loadSnapshot();
    } catch (error) {
      this.logger.warn("bootstrap parity check failed to read delegate snapshot", { error });
      return;
    }

    const diffs = diffStateSnapshots(delegateSnapshot, mirrorSnapshot);
    if (diffs.length === 0) {
      if (this.bootstrapParityState !== "in-parity") {
        this.bootstrapParityState = "in-parity";
        this.logger.info("livestore read pilot bootstrap parity check passed", {
          lastStateSeq: mirrorSnapshot.lastStateSeq,
        });
      }
      return;
    }

    this.bootstrapParityState = "drift";
    this.logger.warn("livestore read pilot bootstrap parity drift detected", {
      diffCount: diffs.length,
      samplePaths: diffs.slice(0, 5).map((diff) => diff.path),
      delegateLastStateSeq: delegateSnapshot.lastStateSeq,
      mirrorLastStateSeq: mirrorSnapshot.lastStateSeq,
    });
  }

  listMessages(raw: StateListMessagesInput): StateListMessagesResult {
    try {
      const result = this.mirror.debugListMessages(raw);
      if (this.enableListMessagesParityCheck) {
        this.checkListMessagesParity(raw, result);
      }
      this.logReadSourceChange("state.listMessages", this.listMessagesSource, "livestore", {
        threadId: raw.threadId,
      });
      this.listMessagesSource = "livestore";
      return result;
    } catch (error) {
      this.logger.warn("failed to list messages from livestore mirror; using delegate", {
        error,
        threadId: raw.threadId,
      });
      const result = this.delegate.listMessages(raw);
      this.logReadSourceChange("state.listMessages", this.listMessagesSource, "delegate", {
        threadId: raw.threadId,
      });
      this.listMessagesSource = "delegate";
      return result;
    }
  }

  private checkListMessagesParity(
    raw: StateListMessagesInput,
    mirrorResult: StateListMessagesResult,
  ): void {
    let delegateResult: StateListMessagesResult;
    try {
      delegateResult = this.delegate.listMessages(raw);
    } catch (error) {
      this.logger.warn("list-messages parity check failed to read delegate listMessages", { error });
      return;
    }

    const diffs = diffListMessagesResults(delegateResult, mirrorResult);
    if (diffs.length === 0) {
      if (this.listMessagesParityState !== "in-parity") {
        this.listMessagesParityState = "in-parity";
        this.logger.info("livestore read pilot list-messages parity check passed", {
          threadId: raw.threadId,
          offset: raw.offset ?? 0,
          limit: raw.limit ?? 200,
        });
      }
      return;
    }

    this.listMessagesParityState = "drift";
    this.logger.warn("livestore read pilot list-messages parity drift detected", {
      threadId: raw.threadId,
      offset: raw.offset ?? 0,
      limit: raw.limit ?? 200,
      diffCount: diffs.length,
      sampleDiffs: diffs.slice(0, 5),
    });
  }

  catchUp(raw: StateCatchUpInput): StateCatchUpResult {
    const afterSeq = raw.afterSeq ?? 0;
    try {
      const result = this.mirror.debugCatchUp(afterSeq);
      if (this.enableCatchUpParityCheck) {
        this.checkCatchUpParity(raw, result);
      }
      this.logReadSourceChange("state.catchUp", this.catchUpSource, "livestore", {
        afterSeq,
      });
      this.catchUpSource = "livestore";
      return result;
    } catch (error) {
      this.logger.warn("failed to catch up from livestore mirror; using delegate", {
        error,
        afterSeq,
      });
      const result = this.delegate.catchUp(raw);
      this.logReadSourceChange("state.catchUp", this.catchUpSource, "delegate", {
        afterSeq,
      });
      this.catchUpSource = "delegate";
      return result;
    }
  }

  private checkCatchUpParity(raw: StateCatchUpInput, mirrorResult: StateCatchUpResult): void {
    let delegateResult: StateCatchUpResult;
    try {
      delegateResult = this.delegate.catchUp(raw);
    } catch (error) {
      this.logger.warn("catch-up parity check failed to read delegate catch-up", { error });
      return;
    }

    const diffs = diffCatchUpResults(delegateResult, mirrorResult);
    if (diffs.length === 0) {
      if (this.catchUpParityState !== "in-parity") {
        this.catchUpParityState = "in-parity";
        this.logger.info("livestore read pilot catch-up parity check passed", {
          afterSeq: raw.afterSeq ?? 0,
          lastStateSeq: mirrorResult.lastStateSeq,
        });
      }
      return;
    }

    this.catchUpParityState = "drift";
    this.logger.warn("livestore read pilot catch-up parity drift detected", {
      afterSeq: raw.afterSeq ?? 0,
      diffCount: diffs.length,
      sampleDiffs: diffs.slice(0, 5),
      delegateLastStateSeq: delegateResult.lastStateSeq,
      mirrorLastStateSeq: mirrorResult.lastStateSeq,
    });
  }

  private logReadSourceChange(
    route: "state.bootstrap" | "state.catchUp" | "state.listMessages",
    previous: LiveStoreReadSource,
    next: LiveStoreReadSource,
    metadata: Record<string, unknown>,
  ): void {
    if (previous === next) {
      return;
    }
    this.logger.info(`serving ${route} from ${next}`, {
      source: next,
      previousSource: previous,
      ...metadata,
    });
  }

  getAppSettings(): AppSettings {
    return this.delegate.getAppSettings();
  }

  updateAppSettings(raw: AppSettingsUpdateInput): AppSettings {
    return this.delegate.updateAppSettings(raw);
  }

  createThread(raw: ThreadsCreateInput): ThreadsUpdateResult {
    return this.delegate.createThread(raw);
  }

  updateThreadTerminalState(raw: ThreadsUpdateTerminalStateInput): ThreadsUpdateResult {
    return this.delegate.updateThreadTerminalState(raw);
  }

  updateThreadModel(raw: ThreadsUpdateModelInput): ThreadsUpdateResult {
    return this.delegate.updateThreadModel(raw);
  }

  updateThreadTitle(raw: ThreadsUpdateTitleInput): ThreadsUpdateResult {
    return this.delegate.updateThreadTitle(raw);
  }

  updateThreadBranch(raw: ThreadsUpdateBranchInput): ThreadsUpdateResult {
    return this.delegate.updateThreadBranch(raw);
  }

  markThreadVisited(raw: ThreadsMarkVisitedInput): ThreadsUpdateResult {
    return this.delegate.markThreadVisited(raw);
  }

  deleteThread(raw: ThreadsDeleteInput): void {
    this.delegate.deleteThread(raw);
  }

  listProjects(): ProjectListResult {
    return this.delegate.listProjects();
  }

  addProject(raw: ProjectAddInput): ProjectAddResult {
    return this.delegate.addProject(raw);
  }

  removeProject(raw: ProjectRemoveInput): void {
    this.delegate.removeProject(raw);
  }

  updateProjectScripts(raw: ProjectUpdateScriptsInput): ProjectUpdateScriptsResult {
    return this.delegate.updateProjectScripts(raw);
  }

  applyCheckpointRevert(input: ApplyCheckpointRevertInput): void {
    this.delegate.applyCheckpointRevert(input);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.unsubscribeDelegate();
    this.removeAllListeners();
    void this.mirror.dispose();
  }
}

function diffCatchUpResults(expected: StateCatchUpResult, actual: StateCatchUpResult): string[] {
  const diffs: string[] = [];

  if (expected.lastStateSeq !== actual.lastStateSeq) {
    diffs.push(
      `lastStateSeq mismatch: expected=${expected.lastStateSeq} actual=${actual.lastStateSeq}`,
    );
  }

  if (expected.events.length !== actual.events.length) {
    diffs.push(`events.length mismatch: expected=${expected.events.length} actual=${actual.events.length}`);
  }

  const minLength = Math.min(expected.events.length, actual.events.length);
  for (let index = 0; index < minLength; index += 1) {
    const expectedEvent = expected.events[index];
    const actualEvent = actual.events[index];
    if (!expectedEvent || !actualEvent) {
      continue;
    }
    if (expectedEvent.seq !== actualEvent.seq) {
      diffs.push(`events[${index}].seq mismatch: expected=${expectedEvent.seq} actual=${actualEvent.seq}`);
    }
    if (expectedEvent.eventType !== actualEvent.eventType) {
      diffs.push(
        `events[${index}].eventType mismatch: expected=${expectedEvent.eventType} actual=${actualEvent.eventType}`,
      );
    }
    if (expectedEvent.entityId !== actualEvent.entityId) {
      diffs.push(
        `events[${index}].entityId mismatch: expected=${expectedEvent.entityId} actual=${actualEvent.entityId}`,
      );
    }
    const expectedPayload = JSON.stringify(expectedEvent.payload);
    const actualPayload = JSON.stringify(actualEvent.payload);
    if (expectedPayload !== actualPayload) {
      diffs.push(`events[${index}].payload mismatch`);
    }
  }

  return diffs;
}

function diffListMessagesResults(
  expected: StateListMessagesResult,
  actual: StateListMessagesResult,
): string[] {
  const diffs: string[] = [];

  if (expected.total !== actual.total) {
    diffs.push(`total mismatch: expected=${expected.total} actual=${actual.total}`);
  }
  if (expected.nextOffset !== actual.nextOffset) {
    diffs.push(
      `nextOffset mismatch: expected=${String(expected.nextOffset)} actual=${String(actual.nextOffset)}`,
    );
  }
  if (expected.messages.length !== actual.messages.length) {
    diffs.push(
      `messages.length mismatch: expected=${expected.messages.length} actual=${actual.messages.length}`,
    );
  }

  const minLength = Math.min(expected.messages.length, actual.messages.length);
  for (let index = 0; index < minLength; index += 1) {
    const expectedMessage = expected.messages[index];
    const actualMessage = actual.messages[index];
    if (!expectedMessage || !actualMessage) {
      continue;
    }
    const expectedSerialized = JSON.stringify(expectedMessage);
    const actualSerialized = JSON.stringify(actualMessage);
    if (expectedSerialized !== actualSerialized) {
      diffs.push(`messages[${index}] mismatch`);
    }
  }

  return diffs;
}
