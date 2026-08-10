import { PreparedMountRecord } from "../../mounts/types";

type Failure = { message: string; error: unknown };

export function withError(
  record: PreparedMountRecord,
  message: string,
  error: unknown,
): PreparedMountRecord {
  const entries = errorEntries(record.snapshot.entries, { message, error });
  return updated(record, entries);
}

function updated(
  record: PreparedMountRecord,
  entries: [string, string][],
): PreparedMountRecord {
  return {
    ...record,
    fetchedAt: new Date().toISOString(),
    snapshot: { ...record.snapshot, entries },
  };
}

function errorEntries(
  entries: [string, string][],
  failure: Failure,
): [string, string][] {
  const byPath = new Map(entries);
  byPath.set("last-error.json", errorContent(failure));
  return [...byPath];
}

function errorContent(failure: Failure) {
  return JSON.stringify(errorPayload(failure));
}

function errorPayload({ message, error }: Failure) {
  const detail = error instanceof Error ? error.message : String(error);
  return { message, error: detail, at: new Date().toISOString() };
}
