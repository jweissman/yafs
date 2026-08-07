import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";

export type Delivery = {
  record: PreparedMountRecord;
  path: string;
  content: string;
  count: number;
};

export async function commitDelivery(
  mounts: MountManager,
  journal: Journal,
  delivery: Delivery,
) {
  const fresh = mounts.mounts().find((item) => item.id === delivery.record.id);
  if (!fresh) {
    return;
  }
  await publish(mounts, journal, appended({ ...delivery, record: fresh }));
}

async function publish(
  mounts: MountManager,
  journal: Journal,
  updated: PreparedMountRecord,
) {
  await journal.commit([
    { type: "refresh", record: updated, at: new Date().toISOString() },
  ]);
  mounts.refresh(updated, "system");
}

function appended(delivery: Delivery): PreparedMountRecord {
  const { record, path, content, count } = delivery;
  const entries = withContent(record.snapshot.entries, path, content);
  const fields = {
    fetchedAt: new Date().toISOString(),
    revision: revision(record, count),
  };
  return { ...record, ...fields, snapshot: { ...record.snapshot, entries } };
}

function revision(record: PreparedMountRecord, count: number) {
  return `${record.manifestDigest.slice(0, 12)}:${count}`;
}

function withContent(
  entries: [string, string][],
  path: string,
  content: string,
): [string, string][] {
  if (!entries.some(([entryPath]) => entryPath === path)) {
    return [...entries, [path, content]];
  }
  return entries.map((entry) => updated(entry, path, content));
}

function updated(
  [entryPath, value]: [string, string],
  path: string,
  content: string,
): [string, string] {
  return [entryPath, entryPath === path ? content : value];
}
