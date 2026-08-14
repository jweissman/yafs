import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { Wiring } from "../../mounts/Plugin";
import {
  FixtureConfig,
  PreparedMountRecord,
  StreamSpec,
} from "../../mounts/types";
import { commitDelivery, Delivery } from "./FixtureStreamCommit";
import { FixtureStreamRegistration } from "./FixtureStreamRegistration";
import { pendingDelivery } from "./FixtureStreamSchedule";

const POLL_MS = 50;

export class FixtureStreamDriver {
  private timer?: Timer;
  private readonly registration: FixtureStreamRegistration;
  private readonly mounts: MountManager;
  private readonly journal: Journal;
  private readonly enqueue: (work: () => Promise<void>) => Promise<void>;

  constructor(
    wiring: Wiring,
    private readonly now = () => Date.now(),
  ) {
    this.mounts = wiring.mounts;
    this.journal = wiring.journal;
    this.enqueue = wiring.enqueue;
    this.registration = this.buildRegistration(wiring);
  }

  private buildRegistration(wiring: Wiring) {
    return new FixtureStreamRegistration(
      wiring.mounts,
      wiring.registerCtl,
      wiring.unregisterCtl,
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
    const delivery = pendingDelivery(this.now, record, path, spec);
    if (delivery) {
      void this.enqueue(() => this.commit(delivery));
    }
  }

  private async restart(mountId: string, payload: string) {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    if (record) {
      await this.restartRecord(record, payload);
    }
  }

  private restartRecord(record: PreparedMountRecord, payload: string) {
    const streams = (record.config as FixtureConfig).streams || {};
    const path = this.restartTarget(payload, streams);
    return this.commit({ record, path, content: "", count: 0 });
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
