import { readFile } from "node:fs/promises";

import { VfsSnapshot } from "../vfs/Snapshot";
import { NodeStore } from "../vfs/NodeStore";
import { writeAtomically } from "./JournalStorage";
import { JournalReplayer } from "./JournalTypes";
import { checksum, notFound, VERSION } from "./JournalChecksum";
import { discardTornFinalRecord, replay } from "./JournalReplayRecords";

type StoredSnapshot = Omit<VfsSnapshot, "version"> & {
  version: number;
  checksum: string;
};

export async function restoreJournal(
  wal: string,
  snapshot: string,
  store: NodeStore,
  replayer?: JournalReplayer,
): Promise<number> {
  const sequence = await restoreSnapshot(snapshot, store);
  await discardTornFinalRecord(wal);
  return replay(wal, { store, replayer }, sequence);
}

export async function writeSnapshot(path: string, snapshot: VfsSnapshot) {
  await writeAtomically(
    path,
    JSON.stringify({ ...snapshot, checksum: checksum(snapshot) }),
  );
}

async function restoreSnapshot(
  path: string,
  store: NodeStore,
): Promise<number> {
  try {
    return applySnapshot(store, await readSnapshot(path));
  } catch (error: unknown) {
    return missingSnapshotFallback(error);
  }
}

function missingSnapshotFallback(error: unknown) {
  if (!notFound(error)) {
    throw error;
  }
  return 0;
}

async function readSnapshot(path: string): Promise<StoredSnapshot> {
  return JSON.parse(await readFile(path, "utf8")) as StoredSnapshot;
}

function applySnapshot(store: NodeStore, snapshot: StoredSnapshot): number {
  verifySnapshot(snapshot);
  store.restore(snapshot);
  return snapshot.sequence;
}

function verifySnapshot(
  snapshot: StoredSnapshot,
): asserts snapshot is VfsSnapshot & { checksum: string } {
  if (
    snapshot.version !== VERSION ||
    snapshot.checksum !== checksum(snapshotData(snapshot))
  ) {
    throw new Error("Corrupt snapshot");
  }
}

function snapshotData(snapshot: StoredSnapshot) {
  return {
    version: snapshot.version,
    sequence: snapshot.sequence,
    root: snapshot.root,
  };
}
