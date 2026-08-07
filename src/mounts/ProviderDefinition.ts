import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountProvider, MountRecord, PreparedMountRecord } from "./types";

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
export type ProviderDefinition = {
  name: MountProvider;
  capabilities(): string[];
  actions?(): PluginActionDefinition[];
  exposures?(): PluginExposureDefinition[];
  prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ): PreparedMountRecord | Promise<PreparedMountRecord>;
};
