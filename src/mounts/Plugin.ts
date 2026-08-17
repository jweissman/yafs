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
  // A provider-derived default under /world, used only when the manifest
  // omits `path:` — an explicit `path:` always wins. No default means the
  // provider has no natural identity to derive one from (e.g. fixture,
  // agent); `path:` stays required for those. See PRODUCT-SPEC.md's
  // "Namespace: three concepts" section.
  defaultPath(_config: MountConfig): string | undefined {
    return undefined;
  }
  // A short, human/model-readable hint of the resource layout beneath this
  // mount's root (e.g. "pulls/<number>/{metadata.json,diff.patch}"),
  // surfaced to a scoped persona via yafs.start_here so it doesn't have to
  // infer the shape from source code or stale prompt text. Informational
  // only, not a validated schema — see PRODUCT-SPEC.md's "Namespace: three
  // concepts" section. No description means nothing beyond the default
  // orientation is worth stating (e.g. fixture, agent).
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
}
