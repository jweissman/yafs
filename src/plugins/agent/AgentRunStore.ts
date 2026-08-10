import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { publishEntries } from "../../mounts/MountEntryPublish";
import {
  contextEntry,
  detail,
  Entry,
  requestEntry,
  responseEntry,
  RunId,
  statusEntry,
} from "./AgentRunEntries";

export type Status = {
  state:
    "queued" | "running" | "complete" | "failed" | "interrupted" | "cancelled";
  startedAt: string;
  completedAt?: string;
  error?: string;
};

function completeStatus(startedAt: string): Status {
  return {
    state: "complete",
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

function withContext(entries: Entry[], id: RunId, context?: string) {
  return context === undefined
    ? entries
    : [...entries, contextEntry(id, context)];
}

export class AgentRunStore {
  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
  ) {}

  writeStatus(id: RunId, status: Status) {
    return this.commitEntries(
      id,
      [statusEntry(id, status)],
      detail(id, status),
    );
  }

  writeIncrementalResponse(id: RunId, partial: string) {
    return this.commitEntries(id, [responseEntry(id, partial)], "");
  }

  accept(id: RunId, message: string, status: Status, context?: string) {
    const updates = this.acceptedEntries(id, message, status, context);
    return this.applyEntries(id, updates, detail(id, status));
  }

  private acceptedEntries(
    id: RunId,
    message: string,
    status: Status,
    context?: string,
  ) {
    const entries = [statusEntry(id, status), requestEntry(id, message)];
    return withContext(entries, id, context);
  }

  interrupt(id: RunId, status: Status) {
    return this.applyEntries(id, [statusEntry(id, status)], detail(id, status));
  }

  cancel(id: RunId, status: Status) {
    return this.interrupt(id, status);
  }

  finish(
    request: RunId & { startedAt: string; message: string; reply: string },
  ) {
    const { startedAt, message, reply, ...id } = request;
    const completed = this.completion(id, startedAt, message, reply);
    return this.commitEntries(id, completed.updates, completed.entryDetail);
  }

  private completion(
    id: RunId,
    startedAt: string,
    message: string,
    reply: string,
  ) {
    const status = completeStatus(startedAt);
    const updates = this.runFiles(id, status, message, reply);
    return { updates, entryDetail: detail(id, status) };
  }

  private runFiles(
    id: RunId,
    status: Status,
    message: string,
    reply: string,
  ): Entry[] {
    const request = requestEntry(id, message);
    return [statusEntry(id, status), request, responseEntry(id, reply)];
  }

  private commitEntries(id: RunId, updates: Entry[], entryDetail: string) {
    return this.enqueue(() => this.applyEntries(id, updates, entryDetail));
  }

  private async applyEntries(id: RunId, updates: Entry[], info: string) {
    const record = this.record(id.mountId);
    if (record) {
      const deps = { mounts: this.mounts, journal: this.journal };
      await publishEntries(deps, record, updates, info);
    }
  }

  private record(mountId: string) {
    return this.mounts.mounts().find((item) => item.id === mountId);
  }
}
