import { createHash } from "node:crypto";

import { NodeStore } from "../vfs/NodeStore";
import {
  appendAndSync,
  acquireLock,
  prepareJournal,
  removeIfPresent,
  truncateAndSync,
} from "./JournalStorage";
import { restoreJournal, writeSnapshot } from "./JournalRecovery";
import { JournalRecord, JournalReplayer } from "./JournalTypes";

const SNAPSHOT_INTERVAL = 32;

export class Journal {
  private constructor(
    private readonly walPath: string,
    private readonly lockPath: string,
    private sequence: number,
  ) {}

  static async open(
    walPath: string,
    store: NodeStore,
    replay?: JournalReplayer,
  ): Promise<Journal> {
    const journal = await Journal.lock(walPath);
    return journal.restore(store, replay);
  }

  private static async lock(walPath: string) {
    await prepareJournal(walPath);
    const lockPath = `${walPath}.lock`;
    await acquireLock(lockPath);
    return new Journal(walPath, lockPath, 0);
  }

  private async restore(
    store: NodeStore,
    replay?: JournalReplayer,
  ): Promise<Journal> {
    this.sequence = await this.recoveredSequence(store, replay).catch((error) =>
      this.closeThenRethrow(error),
    );
    return this;
  }

  private async closeThenRethrow(error: unknown): Promise<never> {
    await this.close();
    throw error;
  }

  private recoveredSequence(store: NodeStore, replay?: JournalReplayer) {
    return restoreJournal(this.walPath, this.snapshotPath(), store, replay);
  }

  async commit(operations: JournalRecord["operation"][]) {
    if (!operations.length) {
      return;
    }
    await appendAndSync(this.walPath, this.records(operations));
    this.sequence += operations.length;
  }

  private records(operations: JournalRecord["operation"][]) {
    return operations.map((operation, index) => this.record(operation, index));
  }

  async compact(store: NodeStore) {
    if (this.sequence % SNAPSHOT_INTERVAL) {
      return;
    }
    await writeSnapshot(this.snapshotPath(), store.snapshot(this.sequence));
    await truncateAndSync(this.walPath);
  }

  async close() {
    await removeIfPresent(this.lockPath);
  }

  private record(
    operation: JournalRecord["operation"],
    index: number,
  ): JournalRecord {
    const sequence = this.sequence + index + 1;
    return signed({ version: 1 as const, sequence, operation });
  }

  private snapshotPath() {
    return `${this.walPath}.snapshot`;
  }
}

function signed(data: Omit<JournalRecord, "checksum">): JournalRecord {
  return { ...data, checksum: checksum(data) };
}

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
