import { AbsolutePath } from "../core/AbsolutePath";
import { BuiltinCommand } from "../commands/BuiltinCommand";
import { CtlHandler } from "../protocol/CtlDispatch";
import { Journal } from "../protocol/Journal";
import { MountManager } from "./MountManager";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import {
  MountConfig,
  MountProvider,
  MountRecord,
  PreparedMountRecord,
} from "./types";

export type PluginActionDefinition = {
  name: string;
  capability: string;
  transport: "ctl";
  pseudobinary?: string;
};
export type PluginExposureDefinition = {
  name: string;
  protocol: "http" | "resp" | "s3";
  status: "designed";
};

export type Wiring = {
  mounts: MountManager;
  journal: Journal;
  enqueue: (work: () => Promise<void>) => Promise<void>;
  registerCtl: (path: AbsolutePath, handler: CtlHandler) => void;
  unregisterCtl: (path: AbsolutePath) => void;
};

export type PluginDriver = {
  start?(): void;
  close(): void;
  sync(): void;
  recover?(): Promise<unknown>;
};

export abstract class Plugin {
  constructor() {}

  abstract readonly name: MountProvider;
  abstract capabilities(): string[];
  abstract parseConfig(value: unknown): MountConfig;
  abstract prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ): PreparedMountRecord | Promise<PreparedMountRecord>;

  actions(): PluginActionDefinition[] {
    return [];
  }
  exposures(): PluginExposureDefinition[] {
    return [];
  }
  commands(): BuiltinCommand[] {
    return [];
  }
}
