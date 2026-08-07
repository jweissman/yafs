import { MountPersistence } from "./MountPersistence";
import { ProviderRegistry } from "./ProviderRegistry";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";

export type PrepareServices = {
  providers: ProviderRegistry;
  persistence: MountPersistence;
  snapshots: SnapshotMaterializer;
};

export function servicesFor(
  providers: ProviderRegistry,
  persistence: MountPersistence,
  snapshots: SnapshotMaterializer,
): PrepareServices {
  return { providers, persistence, snapshots };
}

export function prepareRecord(
  services: PrepareServices,
  record: MountRecord,
  current: PreparedMountRecord | undefined,
  actor: string,
) {
  const { providers, persistence, snapshots } = services;
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
