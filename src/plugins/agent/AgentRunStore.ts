import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";
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
    return context === undefined
      ? entries
      : [...entries, contextEntry(id, context)];
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
    const { updates, entryDetail } = this.completion(
      id,
      startedAt,
      message,
      reply,
    );
    return this.commitEntries(id, updates, entryDetail);
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
    return [
      statusEntry(id, status),
      requestEntry(id, message),
      responseEntry(id, reply),
    ];
  }

  private commitEntries(id: RunId, updates: Entry[], entryDetail: string) {
    return this.enqueue(() => this.applyEntries(id, updates, entryDetail));
  }

  private async applyEntries(id: RunId, updates: Entry[], entryDetail: string) {
    const record = this.mounts.mounts().find((item) => item.id === id.mountId);
    if (!record) {
      return;
    }
    const entries = this.merged(record.snapshot.entries, updates);
    await this.commit(this.withEntries(record, entries), entryDetail);
  }

  private withEntries(
    record: PreparedMountRecord,
    entries: Entry[],
  ): PreparedMountRecord {
    return {
      ...record,
      fetchedAt: new Date().toISOString(),
      snapshot: { ...record.snapshot, entries },
    };
  }

  private async commit(updated: PreparedMountRecord, entryDetail: string) {
    await this.journal.commit([
      { type: "refresh", record: updated, at: new Date().toISOString() },
    ]);
    this.mounts.refresh(updated, "system", entryDetail);
  }

  private merged(entries: Entry[], updates: Entry[]): Entry[] {
    const byPath = new Map(entries);
    updates.forEach(([path, content]) => byPath.set(path, content));
    return [...byPath];
  }
}
