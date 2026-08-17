import { open, readFile } from "node:fs/promises";

import { NodeStore } from "../vfs/NodeStore";
import { JournalRecord, JournalReplayer } from "./JournalTypes";
import { checksum, notFound, VERSION } from "./JournalChecksum";

export interface ReplayContext {
  store: NodeStore;
  replayer?: JournalReplayer;
}

export async function discardTornFinalRecord(path: string) {
  try {
    await discardTornTail(path);
  } catch (error: unknown) {
    if (!notFound(error)) {
      throw error;
    }
  }
}

async function discardTornTail(path: string) {
  const data = await readFile(path, "utf8");
  if (!data || data.endsWith("\n")) {
    return;
  }
  await truncateAt(path, data.lastIndexOf("\n") + 1);
}

async function truncateAt(path: string, length: number) {
  const file = await open(path, "r+");
  await file.truncate(length);
  await file.sync();
  await file.close();
}

export async function replay(
  path: string,
  ctx: ReplayContext,
  sequence: number,
) {
  return readFile(path, "utf8")
    .then((data) => applyRecords(data, ctx, sequence))
    .catch((error: unknown) => replayFallback(error, sequence));
}

function replayFallback(error: unknown, sequence: number) {
  if (notFound(error)) {
    return sequence;
  }
  throw error;
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
    return replayRecord(JSON.parse(line) as StoredRecord, ctx, sequence);
  } catch {
    throw new Error("Corrupt journal record");
  }
}

type StoredRecord = Omit<JournalRecord, "version"> & { version: number };

function replayRecord(
  record: StoredRecord,
  ctx: ReplayContext,
  sequence: number,
) {
  verifyRecord(record);
  return record.sequence <= sequence
    ? sequence
    : applyNext(record, ctx, sequence);
}

function applyNext(
  record: JournalRecord,
  ctx: ReplayContext,
  sequence: number,
) {
  if (record.sequence !== sequence + 1) {
    throw new Error("Corrupt journal record");
  }
  return applied(record, ctx);
}

function applied(record: JournalRecord, ctx: ReplayContext) {
  ctx.store.apply(record.operation);
  ctx.replayer?.(record.operation);
  return record.sequence;
}

function verifyRecord(record: StoredRecord): asserts record is JournalRecord {
  if (
    record.version !== VERSION ||
    record.checksum !== checksum(recordData(record))
  ) {
    throw new Error("Corrupt journal record");
  }
}

function recordData(record: StoredRecord) {
  return {
    version: record.version,
    sequence: record.sequence,
    operation: record.operation,
  };
}
