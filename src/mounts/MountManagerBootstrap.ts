import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { MountReplayer } from "./MountReplay";
import { PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";

export function persistenceFor(statePath?: string, auditPath?: string) {
  return new MountPersistence(statePath, auditPath);
}

export function plannerFor(
  store: NodeStore,
  records: () => PreparedMountRecord[],
  providers: ProviderRegistry,
) {
  return new MountPlanner(store, records, providers);
}

export function replayerFor(
  snapshots: () => import("./SnapshotMaterializer").SnapshotMaterializer,
  records: () => PreparedMountRecord[],
  commit: (records: PreparedMountRecord[]) => void,
) {
  return new MountReplayer(snapshots, records, commit);
}
