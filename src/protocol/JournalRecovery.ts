import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";

import { VfsSnapshot } from "../vfs/Snapshot";
import { NodeStore } from "../vfs/NodeStore";
import { writeAtomically } from "./JournalStorage";
import { JournalRecord, JournalReplayer } from "./JournalTypes";

const VERSION = 1;
type StoredSnapshot = VfsSnapshot & { checksum: string };
type ReplayContext = { store: NodeStore; replayer?: JournalReplayer };

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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function readSnapshot(path: string): Promise<StoredSnapshot> {
  return JSON.parse(await readFile(path, "utf8")) as StoredSnapshot;
}

async function replay(path: string, ctx: ReplayContext, sequence: number) {
  try {
    return applyRecords(await readFile(path, "utf8"), ctx, sequence);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return sequence;
    }
    throw error;
  }
}

async function discardTornFinalRecord(path: string) {
  try {
    const data = await readFile(path, "utf8");
    if (!data || data.endsWith("\n")) {
      return;
    }
    await truncateAt(path, data.lastIndexOf("\n") + 1);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function truncateAt(path: string, length: number) {
  const file = await open(path, "r+");
  await file.truncate(length);
  await file.sync();
  await file.close();
}

function applyRecords(data: string, ctx: ReplayContext, sequence: number) {
  return data
    .split("\n")
    .slice(0, -1)
    .filter(Boolean)
    .reduce((current, line) => applyRecord(line, ctx, current), sequence);
}

function applyRecord(line: string, ctx: ReplayContext, sequence: number) {
  try {
    return replayRecord(JSON.parse(line) as JournalRecord, ctx, sequence);
  } catch {
    throw new Error("Corrupt journal record");
  }
}

function replayRecord(
  record: JournalRecord,
  ctx: ReplayContext,
  sequence: number,
) {
  verifyRecord(record);
  if (record.sequence <= sequence) {
    return sequence;
  }
  return applyNext(record, ctx, sequence);
}

function applyNext(
  record: JournalRecord,
  ctx: ReplayContext,
  sequence: number,
) {
  if (record.sequence !== sequence + 1) {
    throw new Error("Corrupt journal record");
  }
  ctx.store.apply(record.operation);
  ctx.replayer?.(record.operation);
  return record.sequence;
}

function verifyRecord(record: JournalRecord) {
  if (
    record.version !== VERSION ||
    record.checksum !== checksum(data(record))
  ) {
    throw new Error("Corrupt journal record");
  }
}

function data(record: JournalRecord) {
  return {
    version: record.version,
    sequence: record.sequence,
    operation: record.operation,
  };
}

function applySnapshot(store: NodeStore, snapshot: StoredSnapshot): number {
  verifySnapshot(snapshot);
  store.restore(snapshot);
  return snapshot.sequence;
}

function verifySnapshot(snapshot: StoredSnapshot) {
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

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
