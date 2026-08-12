import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { withError } from "./SlackErrorRecord";
import { parseSlackAction } from "./SlackAction";
import { SlackOutboxStore } from "./SlackOutboxStore";
import { recoverSlackOutbox } from "./SlackOutboxRecovery";
import { queuedStatus } from "./SlackOutboxStatus";
import { attemptDelivery, AttemptDeps } from "./SlackOutboxAttempt";

export type SlackPoster = {
  postMessage(channel: string, text: string): Promise<string>;
};
type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
export type Ctl = { registerCtl: RegisterCtl; unregisterCtl: UnregisterCtl };
type ClientFor = (config: SlackConfig) => SlackPoster;
type Enqueue = (work: () => Promise<void>) => Promise<void>;

export class SlackDirectoryDriver {
  private registered = new Set<AbsolutePath>();
  private readonly outbox: SlackOutboxStore;

  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: Enqueue,
    private readonly ctl: Ctl,
    private readonly clientFor: ClientFor,
  ) {
    this.outbox = new SlackOutboxStore(mounts, journal, enqueue);
  }

  close() {
    this.registered.forEach((path) => this.ctl.unregisterCtl(path));
    this.registered.clear();
  }

  sync() {
    const paths = new Set<AbsolutePath>();
    this.mounts
      .mounts()
      .forEach((record) => this.registerRecord(record, paths));
    this.unregisterUnpaired(paths);
    this.registered = paths;
  }

  async recover() {
    return recoverSlackOutbox(this.mounts, this.outbox);
  }

  private unregisterUnpaired(paths: Set<AbsolutePath>) {
    this.registered.forEach((path) => {
      if (!paths.has(path)) {
        this.ctl.unregisterCtl(path);
      }
    });
  }

  private registerRecord(
    record: PreparedMountRecord,
    paths: Set<AbsolutePath>,
  ) {
    if (record.provider === "slack") {
      paths.add(this.registerCtl(record));
    }
  }

  private registerCtl(record: PreparedMountRecord): AbsolutePath {
    const path = `${record.path}/ctl` as AbsolutePath;
    this.ctl.registerCtl(path, (payload) => this.send(record.id, payload));
    return path;
  }

  // Durable acceptance must complete before this handler returns — the ctl
  // write is only acknowledged to the caller once `outbox.accept` has run,
  // so "accepted" genuinely means "durably queued," not "queued in memory."
  private async send(mountId: string, payload: string) {
    const action = parseSlackAction(payload);
    const id = { mountId, actionId: action.actionId || randomUUID() };
    const startedAt = new Date().toISOString();
    await this.outbox.accept(id, action.message, queuedStatus(startedAt));
    const attempt = { id, message: action.message, startedAt };
    void attemptDelivery(this.attemptDeps(), attempt);
  }

  private attemptDeps(): AttemptDeps {
    return {
      outbox: this.outbox,
      post: (mountId, message) => this.post(mountId, message),
      commitRefresh: (mountId) => this.commitRefresh(mountId),
      commitError: (mountId, message, error) =>
        this.commitError(mountId, message, error),
    };
  }

  private async post(mountId: string, message: string) {
    const config = this.record(mountId).config as SlackConfig;
    await this.clientFor(config).postMessage(config.channel, message);
  }

  private record(mountId: string): PreparedMountRecord {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    if (!record) {
      throw new Error(`No such mount: ${mountId}`);
    }
    return record;
  }

  private commitRefresh(mountId: string) {
    return this.enqueue(() => this.applyRefresh(mountId));
  }

  private async applyRefresh(mountId: string) {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    if (!record) {
      return;
    }
    await this.commit(await this.mounts.prepareRefreshRecord(record, "system"));
  }

  private commitError(mountId: string, message: string, error: unknown) {
    return this.enqueue(() => this.applyError(mountId, message, error));
  }

  private async applyError(mountId: string, message: string, error: unknown) {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    if (record) {
      await this.commit(withError(record, message, error));
    }
  }

  private async commit(updated: PreparedMountRecord) {
    await this.journal.commit([
      { type: "refresh", record: updated, at: new Date().toISOString() },
    ]);
    this.mounts.refresh(updated, "system");
  }
}
