import { AbsolutePath } from "../core/AbsolutePath";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountPlanner } from "./MountPlanner";
import { MountRecord, PreparedMountRecord } from "./types";
import { withActivated, withRemoved, withReplaced } from "./MountRecords";

export function assertDesiredAvailable(
  planner: MountPlanner,
  records: PreparedMountRecord[],
  record: MountRecord,
) {
  if (!hasUnchangedPath(existingMount(records, record.id), record)) {
    planner.assertAvailable(record.path);
  }
}

function hasUnchangedPath(
  existing: PreparedMountRecord | undefined,
  record: MountRecord,
) {
  return existing ? unchangedPath(existing, record) : false;
}

function unchangedPath(existing: PreparedMountRecord, record: MountRecord) {
  if (existing.path !== record.path) {
    throw new Error(`Desired mount path changed: ${record.id}`);
  }
  return true;
}

function existingMount(records: PreparedMountRecord[], id: string) {
  return records.find((item) => item.id === id);
}

export function restoredActivation(
  snapshots: SnapshotMaterializer,
  records: PreparedMountRecord[],
  record: PreparedMountRecord,
): PreparedMountRecord[] {
  if (!snapshots.exists(record.path)) {
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

// The operation itself carries `path` (not looked up from `records`)
// because replay can process an "unmount" for a mount whose "mount" event
// predates the last compacted snapshot: in that case `records` (rebuilt
// fresh from this replay pass) never regains an entry for it, even though
// the snapshot's stale content for it still needs removing.
export function restoredUnmount(
  snapshots: SnapshotMaterializer,
  records: PreparedMountRecord[],
  id: string,
  path: AbsolutePath,
): PreparedMountRecord[] {
  removeSnapshot(snapshots, path);
  return withRemoved(records, id);
}

function removeSnapshot(snapshots: SnapshotMaterializer, path: AbsolutePath) {
  if (snapshots.exists(path)) {
    snapshots.remove(path);
  }
}
