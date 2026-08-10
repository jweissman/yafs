import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { withError } from "./SlackErrorRecord";

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

  constructor(
    private readonly mounts: MountManager,
    private readonly journal: Journal,
    private readonly enqueue: Enqueue,
    private readonly ctl: Ctl,
    private readonly clientFor: ClientFor,
  ) {}

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

  private async send(mountId: string, payload: string) {
    const message = this.message(payload);
    void this.attempt(mountId, message);
  }

  private async attempt(mountId: string, message: string) {
    try {
      await this.post(mountId, message);
      await this.commitRefresh(mountId);
    } catch (error) {
      await this.commitError(mountId, message, error);
    }
  }

  private message(payload: string): string {
    const message = (JSON.parse(payload) as { message?: unknown }).message;
    if (typeof message !== "string") {
      throw new Error(`Invalid slack action: ${payload}`);
    }
    return message;
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
