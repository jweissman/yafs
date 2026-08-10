import { MountPersistence } from "./MountPersistence";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { restoredRefresh } from "./MountRestore";
import { auditActivation, auditRefresh } from "./MountAudit";
import { MountRecord, PreparedMountRecord } from "./types";

export type LifecycleDeps = {
  persistence: MountPersistence;
  snapshots: SnapshotMaterializer;
  getRecords: () => PreparedMountRecord[];
  setRecords: (records: PreparedMountRecord[]) => void;
  save: () => void;
};

export function activateMount(
  deps: LifecycleDeps,
  record: PreparedMountRecord,
  actor: string,
) {
  deps.snapshots.materialize(record);
  deps.getRecords().push(record);
  deps.save();
  auditActivation(deps.persistence, record, actor);
}

export type RefreshRequest = {
  previous: PreparedMountRecord;
  record: PreparedMountRecord;
  actor: string;
  detail?: string;
};

export function refreshMount(deps: LifecycleDeps, request: RefreshRequest) {
  const { previous, record, actor, detail } = request;
  deps.snapshots.replace(record);
  deps.setRecords(restoredRefresh(deps.snapshots, deps.getRecords(), record));
  deps.save();
  auditRefresh(deps.persistence, record, actor, previous.revision, detail);
}

export function removeMount(deps: LifecycleDeps, record: MountRecord) {
  deps.snapshots.remove(record);
  deps.setRecords(deps.getRecords().filter((item) => item !== record));
  deps.save();
}
