import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { MountJournal, publishEntries } from "../../mounts/MountEntryPublish";
import { PreparedMountRecord } from "../../mounts/types";
import { ChatMessage, historyEntry, historyFrom } from "./AgentChatHistory";
import { threadEntry, threadResponseId } from "./AgentToolThread";

export type PersonaRef = { mountId: string; personaName: string };

export class AgentChatStore {
  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
  ) {}

  currentHistory(ref: PersonaRef, chatId: string): ChatMessage[] {
    const record = this.record(ref.mountId);
    return record ? historyFrom(record, ref.personaName, chatId) : [];
  }

  appendChatTurn(ref: PersonaRef, chatId: string, message: ChatMessage) {
    return this.enqueue(() => this.applyChatTurn(ref, chatId, message));
  }

  currentResponseId(ref: PersonaRef, chatId: string): string | undefined {
    const record = this.record(ref.mountId);
    if (!record) {
      return undefined;
    }
    return threadResponseId(record, ref.personaName, chatId);
  }

  recordResponseId(ref: PersonaRef, chatId: string, responseId: string) {
    return this.enqueue(() => this.applyResponseId(ref, chatId, responseId));
  }

  private applyResponseId(ref: PersonaRef, chatId: string, responseId: string) {
    const record = this.record(ref.mountId);
    if (record) {
      const entry = threadEntry(ref.personaName, chatId, responseId);
      return publishEntries(this.deps(), { record, updates: [entry] });
    }
  }

  // Accept-time appends run inside the same awaited chain as the ctl
  // response itself (see AgentDirectoryDriver.acceptRun); routing them
  // through `enqueue` would deadlock, since `enqueue` shares the connection's
  // single command-dispatch queue that this call is already running inside.
  // The outer per-line dispatch already serializes accept-time appends
  // against each other, so a direct write is safe here.
  appendChatTurnNow(ref: PersonaRef, chatId: string, message: ChatMessage) {
    return this.applyChatTurn(ref, chatId, message);
  }

  private async applyChatTurn(
    ref: PersonaRef,
    chatId: string,
    message: ChatMessage,
  ) {
    const record = this.record(ref.mountId);
    if (record) {
      await this.commitTurn(record, ref.personaName, chatId, message);
    }
  }

  private commitTurn(
    record: PreparedMountRecord,
    personaName: string,
    chatId: string,
    message: ChatMessage,
  ) {
    const history = [...historyFrom(record, personaName, chatId), message];
    const entry = historyEntry(personaName, chatId, history);
    return publishEntries(this.deps(), { record, updates: [entry] });
  }

  private deps(): MountJournal {
    return { mounts: this.mounts, journal: this.journal };
  }

  private record(mountId: string) {
    return this.mounts.mounts().find((item) => item.id === mountId);
  }
}
