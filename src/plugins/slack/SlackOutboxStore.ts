import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { publishEntries } from "../../mounts/MountEntryPublish";
import {
  Entry,
  messageEntry,
  OutboxId,
  statusEntry,
} from "./SlackOutboxEntries";
import { OutboxStatus } from "./SlackOutboxStatus";

export class SlackOutboxStore {
  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
  ) {}

  // Accept-time writes run inside the same awaited chain as the ctl write
  // itself (see SlackDirectoryDriver.send) — the queued record must exist
  // before the write is acknowledged, matching AgentRunStore.accept.
  // Routing this through `enqueue` would deadlock for the same reason
  // documented on AgentChatStore.appendChatTurnNow.
  accept(id: OutboxId, message: string, status: OutboxStatus) {
    const entries = [messageEntry(id, message), statusEntry(id, status)];
    return this.applyEntries(id, entries);
  }

  writeStatus(id: OutboxId, status: OutboxStatus) {
    return this.enqueue(() => this.applyEntries(id, [statusEntry(id, status)]));
  }

  private async applyEntries(id: OutboxId, entries: Entry[]) {
    const record = this.record(id.mountId);
    if (record) {
      const deps = { mounts: this.mounts, journal: this.journal };
      await publishEntries(deps, record, entries);
    }
  }

  private record(mountId: string) {
    return this.mounts.mounts().find((item) => item.id === mountId);
  }
}
