import { MountPersistence } from "./MountPersistence";
import { PreparedMountRecord } from "./types";

export function auditQuarantine(
  persistence: MountPersistence,
  record: PreparedMountRecord,
  actor: string,
  action: string,
  detail: string,
) {
  persistence.audit(record, actor, action, { outcome: "quarantined", detail });
}

export function auditRefresh(
  persistence: MountPersistence,
  record: PreparedMountRecord,
  actor: string,
  before: string | undefined,
  detail?: string,
) {
  const outcome = refreshOutcome(record, before, detail);
  persistence.audit(record, actor, "refresh", outcome);
}

function refreshOutcome(
  record: PreparedMountRecord,
  before: string | undefined,
  detail?: string,
) {
  return { outcome: "success", before, after: record.revision, detail };
}

export function auditActivation(
  persistence: MountPersistence,
  record: PreparedMountRecord,
  actor: string,
) {
  persistence.audit(record, actor, "activation", {
    outcome: "success",
    after: record.revision,
  });
}

export function auditUnmount(
  persistence: MountPersistence,
  record: PreparedMountRecord,
  actor: string,
) {
  persistence.audit(record, actor, "unmount", {
    outcome: "success",
    before: record.revision,
  });
}
