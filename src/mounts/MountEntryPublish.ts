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

export async function publishEntries(
  mounts: MountManager,
  journal: Journal,
  record: PreparedMountRecord,
  updates: Entry[],
  detail?: string,
  extra?: Partial<PreparedMountRecord>,
) {
  const entries = mergeEntries(record.snapshot.entries, updates);
  const updated = { ...withEntries(record, entries), ...extra };
  await commitRefresh(mounts, journal, updated, detail);
}

async function commitRefresh(
  mounts: MountManager,
  journal: Journal,
  updated: PreparedMountRecord,
  detail?: string,
) {
  await journal.commit([
    { type: "refresh", record: updated, at: new Date().toISOString() },
  ]);
  mounts.refresh(updated, "system", detail);
}
