import { PreparedMountRecord, StreamSpec } from "../../mounts/types";
import { Delivery } from "./FixtureStreamCommit";

export function pendingDelivery(
  now: () => number,
  record: PreparedMountRecord,
  path: string,
  spec: StreamSpec,
): Delivery | undefined {
  const content = contentAt(record, path);
  const index = dueIndex(now, record, content, spec);
  return deliveryOrUndefined({ record, path, content }, spec, index);
}

function deliveryOrUndefined(
  target: DeliveryTarget,
  spec: StreamSpec,
  index: number | undefined,
): Delivery | undefined {
  return index === undefined
    ? undefined
    : nextDelivery(target, spec.chunks[index], index);
}

function dueIndex(
  now: () => number,
  record: PreparedMountRecord,
  content: string,
  spec: StreamSpec,
) {
  const index = deliveredCount(content, spec.chunks);
  const isDue = index < spec.chunks.length && due(now, record, spec.intervalMs);
  return isDue ? index : undefined;
}

function contentAt(record: PreparedMountRecord, path: string): string {
  const found = record.snapshot.entries.find(
    ([entryPath]) => entryPath === path,
  );
  return found?.[1] || "";
}

export function deliveredCount(content: string, chunks: string[]): number {
  let cumulative = "";
  let count = 0;
  while (matchesNext(content, cumulative, chunks, count)) {
    cumulative += chunks[count++];
  }
  return count;
}

function matchesNext(
  content: string,
  cumulative: string,
  chunks: string[],
  count: number,
) {
  const expected = cumulative + chunks[count];
  return count < chunks.length && content.startsWith(expected);
}

function due(
  now: () => number,
  record: PreparedMountRecord,
  intervalMs: number,
): boolean {
  const baseline = record.fetchedAt || record.activatedAt;
  return !baseline || now() - Date.parse(baseline) >= intervalMs;
}

type DeliveryTarget = {
  record: PreparedMountRecord;
  path: string;
  content: string;
};

function nextDelivery(
  target: DeliveryTarget,
  chunk: string,
  index: number,
): Delivery {
  return { ...target, content: target.content + chunk, count: index + 1 };
}
