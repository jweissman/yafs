import { Journal } from "./Journal";
import { MountRefreshScheduler } from "../mounts/MountRefreshScheduler";
import { MountManager } from "../mounts/MountManager";
import { Wiring } from "../mounts/Plugin";
import { PreparedMountRecord } from "../mounts/types";

export interface ServerRefreshTiming {
  now?: () => number;
  intervalMs?: number;
}

export class ServerRefresh {
  private readonly scheduler: MountRefreshScheduler;
  private readonly mounts: MountManager;
  private readonly journal: Journal;
  private readonly enqueue: (work: () => Promise<void>) => Promise<void>;
  private readonly intervalMs: number;
  private timer?: Timer;

  constructor(wiring: Wiring, timing: ServerRefreshTiming = {}) {
    this.mounts = wiring.mounts;
    this.journal = wiring.journal;
    this.enqueue = wiring.enqueue;
    this.intervalMs = timing.intervalMs ?? 60_000;
    this.scheduler = this.buildScheduler(timing.now);
  }

  private buildScheduler(now?: () => number) {
    return new MountRefreshScheduler(
      () => this.mounts.mounts(),
      (record) => this.schedule(record),
      now,
    );
  }

  start() {
    this.timer = setInterval(
      () => void this.due().catch(console.error),
      this.intervalMs,
    );
  }
  close() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
  due() {
    return this.scheduler.tick();
  }

  private schedule(record: PreparedMountRecord) {
    return this.enqueue(() => this.refresh(record));
  }
  private async refresh(record: PreparedMountRecord) {
    try {
      await this.refreshOnce(record);
    } catch (error) {
      console.error(`Scheduled refresh failed for mount ${record.id}:`, error);
    }
  }
  private async refreshOnce(record: PreparedMountRecord) {
    const prepared = await this.mounts.prepareActivation(record, "system");
    await this.journal.commit([
      { type: "refresh", record: prepared, at: new Date().toISOString() },
    ]);
    this.mounts.refresh(prepared, "system");
  }
}
