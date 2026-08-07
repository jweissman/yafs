import { Journal } from "../protocol/Journal";
import { MountManager } from "./MountManager";
import { FixtureConfig, PreparedMountRecord, StreamSpec } from "./types";
import { commitDelivery, Delivery } from "./FixtureStreamCommit";
import {
  FixtureStreamRegistration,
  RegisterCtl,
  UnregisterCtl,
} from "./FixtureStreamRegistration";

const POLL_MS = 50;
type Ctl = { registerCtl: RegisterCtl; unregisterCtl: UnregisterCtl };

export class FixtureStreamDriver {
  private timer?: Timer;
  private readonly registration: FixtureStreamRegistration;

  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
    ctl: Ctl,
    private readonly now = () => Date.now(),
  ) {
    this.registration = new FixtureStreamRegistration(
      mounts,
      ctl.registerCtl,
      ctl.unregisterCtl,
      (mountId, payload) => this.restart(mountId, payload),
    );
  }

  start() {
    this.sync();
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }
  close() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.registration.clear();
  }

  sync() {
    this.registration.sync();
  }

  private tick() {
    this.sync();
    this.mounts.mounts().forEach((record) => this.tickRecord(record));
  }

  private tickRecord(record: PreparedMountRecord) {
    if (record.provider !== "fixture") {
      return;
    }
    const streams = (record.config as FixtureConfig).streams || {};
    Object.entries(streams).forEach(([path, spec]) =>
      this.tickStream(record, path, spec),
    );
  }

  private tickStream(
    record: PreparedMountRecord,
    path: string,
    spec: StreamSpec,
  ) {
    const delivery = this.pendingDelivery(record, path, spec);
    if (delivery) {
      void this.enqueue(() => this.commit(delivery));
    }
  }

  private pendingDelivery(
    record: PreparedMountRecord,
    path: string,
    spec: StreamSpec,
  ): Delivery | undefined {
    const content = this.content(record, path);
    const index = this.deliveredCount(content, spec.chunks);
    const due = index < spec.chunks.length && this.due(record, spec.intervalMs);
    return due
      ? nextDelivery(record, path, content, spec.chunks[index], index)
      : undefined;
  }

  private content(record: PreparedMountRecord, path: string): string {
    const found = record.snapshot.entries.find(
      ([entryPath]) => entryPath === path,
    );
    return found?.[1] || "";
  }

  private deliveredCount(content: string, chunks: string[]): number {
    let cumulative = "";
    let count = 0;
    for (const chunk of chunks) {
      if (!content.startsWith(cumulative + chunk)) {
        break;
      }
      cumulative += chunk;
      count++;
    }
    return count;
  }

  private due(record: PreparedMountRecord, intervalMs: number): boolean {
    const baseline = record.fetchedAt || record.activatedAt;
    return !baseline || this.now() - Date.parse(baseline) >= intervalMs;
  }

  private async restart(mountId: string, payload: string) {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    if (!record) {
      return;
    }
    const path = this.restartTarget(
      payload,
      (record.config as FixtureConfig).streams || {},
    );
    await this.commit({ record, path, content: "", count: 0 });
  }

  private restartTarget(
    payload: string,
    streams: Record<string, StreamSpec>,
  ): string {
    const path = (JSON.parse(payload) as { restart?: unknown }).restart;
    if (typeof path !== "string" || !(path in streams)) {
      throw new Error(`Invalid restart action: ${payload}`);
    }
    return path;
  }

  private commit(delivery: Delivery) {
    return commitDelivery(this.mounts, this.journal, delivery);
  }
}

function nextDelivery(
  record: PreparedMountRecord,
  path: string,
  content: string,
  chunk: string,
  index: number,
): Delivery {
  return { record, path, content: content + chunk, count: index + 1 };
}
