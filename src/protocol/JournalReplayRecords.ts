import { open, readFile } from "node:fs/promises";

import { NodeStore } from "../vfs/NodeStore";
import { JournalRecord, JournalReplayer } from "./JournalTypes";
import { checksum, notFound, VERSION } from "./JournalChecksum";

export type ReplayContext = { store: NodeStore; replayer?: JournalReplayer };

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
  try {
    return applyRecords(await readFile(path, "utf8"), ctx, sequence);
  } catch (error: unknown) {
    return replayFallback(error, sequence);
  }
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
    record.checksum !== checksum(recordData(record))
  ) {
    throw new Error("Corrupt journal record");
  }
}

function recordData(record: JournalRecord) {
  return {
    version: record.version,
    sequence: record.sequence,
    operation: record.operation,
  };
}
