import { MountPersistence } from "./MountPersistence";
import { ProviderRegistry } from "./ProviderRegistry";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";

export function prepareRecord(
  providers: ProviderRegistry,
  persistence: MountPersistence,
  snapshots: SnapshotMaterializer,
  record: MountRecord,
  current: PreparedMountRecord | undefined,
  actor: string,
) {
  const prepared = providers.prepare(record, snapshots, current);
  return prepared instanceof Promise
    ? prepared.catch((error) => fetchFailed(persistence, record, actor, error))
    : prepared;
}

function fetchFailed(
  persistence: MountPersistence,
  record: MountRecord,
  actor: string,
  error: unknown,
): never {
  persistence.audit(record, actor, "fetch", {
    outcome: "failed",
    detail: detail(error),
  });
  throw error;
}

function detail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
