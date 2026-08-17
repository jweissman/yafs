import { Journal } from "../protocol/Journal";
import { MountManager } from "./MountManager";
import { PreparedMountRecord } from "./types";

export type Entry = [string, string];

export function mergeEntries(entries: Entry[], updates: Entry[]): Entry[] {
  const byPath = new Map(entries);
  updates.forEach(([path, content]) => byPath.set(path, content));
  return [...byPath];
}

export function withEntries(
  record: PreparedMountRecord,
  entries: Entry[],
): PreparedMountRecord {
  return {
    ...record,
    fetchedAt: new Date().toISOString(),
    snapshot: { ...record.snapshot, entries },
  };
}

export interface MountJournal {
  mounts: MountManager;
  journal: Journal;
}

export interface PublishRequest {
  record: PreparedMountRecord;
  updates: Entry[];
  detail?: string;
  extra?: Partial<PreparedMountRecord>;
}

export async function publishEntries(
  deps: MountJournal,
  request: PublishRequest,
) {
  const { record, updates, detail, extra } = request;
  const updated = mergedRecord(record, updates, extra);
  await commitRefresh(deps, updated, detail);
}

function mergedRecord(
  record: PreparedMountRecord,
  updates: Entry[],
  extra?: Partial<PreparedMountRecord>,
) {
  const entries = mergeEntries(record.snapshot.entries, updates);
  return { ...withEntries(record, entries), ...extra };
}

async function commitRefresh(
  { mounts, journal }: MountJournal,
  updated: PreparedMountRecord,
  detail?: string,
) {
  await journal.commit([
    { type: "refresh", record: updated, at: new Date().toISOString() },
  ]);
  mounts.refresh(updated, "system", detail);
}
