import { PreparedMountRecord } from "./types";

export function withActivated(
  records: PreparedMountRecord[],
  record: PreparedMountRecord,
): PreparedMountRecord[] {
  const exists = records.some(
    (item) => item.id === record.id && item.path === record.path,
  );
  return exists ? records : [...records, record];
}

export function withReplaced(
  records: PreparedMountRecord[],
  record: PreparedMountRecord,
): PreparedMountRecord[] {
  return records.map((item) => (item.id === record.id ? record : item));
}

export function withRemoved(
  records: PreparedMountRecord[],
  id: string,
): PreparedMountRecord[] {
  return records.filter((item) => item.id !== id);
}
