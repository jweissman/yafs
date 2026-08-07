import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { publishEntries } from "../../mounts/MountEntryPublish";
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
  if (fresh) {
    await publish(mounts, journal, fresh, delivery);
  }
}

function publish(
  mounts: MountManager,
  journal: Journal,
  record: PreparedMountRecord,
  delivery: Delivery,
) {
  const updates: [string, string][] = [[delivery.path, delivery.content]];
  const extra = { revision: revision(record, delivery.count) };
  return publishEntries(mounts, journal, record, updates, undefined, extra);
}

function revision(record: PreparedMountRecord, count: number) {
  return `${record.manifestDigest.slice(0, 12)}:${count}`;
}
