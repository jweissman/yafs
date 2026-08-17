import { MountPersistence } from "./MountPersistence";
import { ProviderRegistry } from "./ProviderRegistry";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";

export interface PrepareServices {
  providers: ProviderRegistry;
  persistence: MountPersistence;
  snapshots: SnapshotMaterializer;
}

export function servicesFor(
  providers: ProviderRegistry,
  persistence: MountPersistence,
  snapshots: SnapshotMaterializer,
): PrepareServices {
  return { providers, persistence, snapshots };
}

export interface PrepareRequest {
  record: MountRecord;
  current: PreparedMountRecord | undefined;
  actor: string;
}

export function prepareRecord(
  services: PrepareServices,
  request: PrepareRequest,
) {
  const prepared = preparedOrPromise(services, request);
  return prepared instanceof Promise
    ? recovered(prepared, services.persistence, request)
    : prepared;
}

function preparedOrPromise(services: PrepareServices, request: PrepareRequest) {
  const { providers, snapshots } = services;
  return providers.prepare(request.record, snapshots, request.current);
}

function recovered(
  prepared: Promise<PreparedMountRecord>,
  persistence: MountPersistence,
  request: PrepareRequest,
) {
  const onError = (error: unknown) =>
    fetchFailed(persistence, request.record, request.actor, error);
  return prepared.catch(onError);
}

function fetchFailed(
  persistence: MountPersistence,
  record: MountRecord,
  actor: string,
  error: unknown,
): never {
  const outcome = { outcome: "failed", detail: detail(error) };
  persistence.audit(record, actor, "fetch", outcome);
  throw error;
}

function detail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
