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

export interface PluginActionDefinition {
  name: string;
  capability: string;
  transport: "ctl";
  pseudobinary?: string;
}
export interface PluginExposureDefinition {
  name: string;
  protocol: "http" | "resp" | "s3";
  status: "designed";
}

export interface Wiring {
  mounts: MountManager;
  journal: Journal;
  enqueue: (work: () => Promise<void>) => Promise<void>;
  registerCtl: (path: AbsolutePath, handler: CtlHandler) => void;
  unregisterCtl: (path: AbsolutePath) => void;
  dispatchCtl: (path: AbsolutePath, payload: string) => Promise<boolean>;
}

export interface PluginDriver {
  start?(): void;
  close(): void;
  sync(): void;
  recover?(): Promise<unknown>;
}

export interface Citation {
  key: string;
  url: string;
  label: string;
}
export interface CitationRenderer {
  kind: string;
  render(reference: object): Citation | undefined;
}

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

  defaultPath(_config: MountConfig): string | undefined {
    return undefined;
  }

  worldDescription(): string | undefined {
    return undefined;
  }
  unavailableCapability(
    _record: Pick<MountRecord, "id">,
    _capability: string,
  ): string | undefined {
    return undefined;
  }
  exposures(): PluginExposureDefinition[] {
    return [];
  }
  commands(): BuiltinCommand[] {
    return [];
  }

  createDriver(_wiring: Wiring): PluginDriver[] {
    return [];
  }

  citationRenderers(): CitationRenderer[] {
    return [];
  }
}
