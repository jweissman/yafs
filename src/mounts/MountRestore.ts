import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountPlanner } from "./MountPlanner";
import { MountRecord, PreparedMountRecord } from "./types";
import { withActivated, withRemoved, withReplaced } from "./MountRecords";

export function assertDesiredAvailable(
  planner: MountPlanner,
  records: PreparedMountRecord[],
  record: MountRecord,
) {
  const existing = records.find((item) => item.id === record.id);
  if (existing && existing.path !== record.path) {
    throw new Error(`Desired mount path changed: ${record.id}`);
  }
  if (!existing) {
    planner.assertAvailable(record.path);
  }
}

export function restoredActivation(
  snapshots: SnapshotMaterializer,
  records: PreparedMountRecord[],
  record: PreparedMountRecord,
): PreparedMountRecord[] {
  if (!snapshots.exists(record)) {
    snapshots.materialize(record);
  }
  return withActivated(records, record);
}

export function restoredRefresh(
  snapshots: SnapshotMaterializer,
  records: PreparedMountRecord[],
  record: PreparedMountRecord,
): PreparedMountRecord[] {
  snapshots.replace(record);
  return withReplaced(records, record);
}

export function restoredUnmount(
  snapshots: SnapshotMaterializer,
  records: PreparedMountRecord[],
  id: string,
): PreparedMountRecord[] {
  const record = records.find((item) => item.id === id);
  if (record) {
    snapshots.remove(record);
  }
  return withRemoved(records, id);
}
