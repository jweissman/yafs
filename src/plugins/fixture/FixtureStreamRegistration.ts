import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { MountManager } from "../../mounts/MountManager";
import { FixtureConfig, PreparedMountRecord } from "../../mounts/types";

export type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
export type UnregisterCtl = (path: AbsolutePath) => void;
type Restart = (mountId: string, payload: string) => Promise<void>;

export class FixtureStreamRegistration {
  private registered = new Set<AbsolutePath>();

  constructor(
    private readonly mounts: MountManager,
    private readonly registerCtl: RegisterCtl,
    private readonly unregisterCtl: UnregisterCtl,
    private readonly restart: Restart,
  ) {}

  sync() {
    const paths = this.currentControls();
    this.unregisterMissing(paths);
    this.registered = paths;
  }

  clear() {
    this.registered.forEach((path) => this.unregisterCtl(path));
    this.registered.clear();
  }

  private currentControls() {
    const paths = new Set<AbsolutePath>();
    this.mounts
      .mounts()
      .forEach((record) => this.registerRecord(record, paths));
    return paths;
  }

  private unregisterMissing(paths: Set<AbsolutePath>) {
    this.registered.forEach((path) => {
      if (!paths.has(path)) {
        this.unregisterCtl(path);
      }
    });
  }

  private registerRecord(
    record: PreparedMountRecord,
    paths: Set<AbsolutePath>,
  ) {
    const streams = (record.config as FixtureConfig).streams || {};
    if (record.provider === "fixture" && Object.keys(streams).length) {
      paths.add(this.registerStreamCtl(record));
    }
  }

  private registerStreamCtl(record: PreparedMountRecord): AbsolutePath {
    const path = ctlPath(record);
    this.registerCtl(path, (payload) => this.restart(record.id, payload));
    return path;
  }
}

function ctlPath(record: PreparedMountRecord): AbsolutePath {
  return `${record.path}/ctl` as AbsolutePath;
}
