import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { Wiring } from "../../mounts/Plugin";
import { PreparedMountRecord } from "../../mounts/types";
import { parseSlackAction } from "./SlackAction";
import { SlackOutboxStore } from "./SlackOutboxStore";
import { recoverSlackOutbox } from "./SlackOutboxRecovery";
import { queuedStatus } from "./SlackOutboxStatus";
import { attemptDelivery } from "./SlackOutboxAttempt";
import { attemptDepsFor, ClientFor, CommitDeps } from "./SlackDirectoryCommit";

export type { SlackPoster, ClientFor } from "./SlackDirectoryCommit";

export class SlackDirectoryDriver {
  private registered = new Set<AbsolutePath>();
  private readonly outbox: SlackOutboxStore;
  private readonly mounts: MountManager;

  constructor(
    private readonly wiring: Wiring,
    private readonly clientFor: ClientFor,
  ) {
    const { mounts, journal, enqueue } = wiring;
    this.mounts = mounts;
    this.outbox = new SlackOutboxStore(mounts, journal, enqueue);
  }

  close() {
    this.registered.forEach((path) => {
      this.wiring.unregisterCtl(path);
    });
    this.registered.clear();
  }

  sync() {
    const paths = new Set<AbsolutePath>();
    this.mounts.mounts().forEach((record) => {
      this.registerRecord(record, paths);
    });
    this.unregisterUnpaired(paths);
    this.registered = paths;
  }

  async recover() {
    return recoverSlackOutbox(this.mounts, this.outbox);
  }

  private unregisterUnpaired(paths: Set<AbsolutePath>) {
    this.registered.forEach((path) => {
      if (!paths.has(path)) {
        this.wiring.unregisterCtl(path);
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
    this.wiring.registerCtl(path, (payload) => this.send(record.id, payload));
    return path;
  }

  private async send(mountId: string, payload: string) {
    const action = parseSlackAction(payload);
    const id = { mountId, actionId: action.actionId ?? randomUUID() };
    const startedAt = new Date().toISOString();
    await this.outbox.accept(id, action.message, queuedStatus(startedAt));
    const attempt = { id, message: action.message, startedAt };
    void attemptDelivery(attemptDepsFor(this.commitDeps()), attempt);
  }

  private commitDeps(): CommitDeps {
    const { wiring, clientFor, outbox } = this;
    return { wiring, clientFor, outbox };
  }
}
