import { MountPersistence } from "./MountPersistence";
import { PreparedMountRecord } from "./types";

export interface QuarantineInfo {
  actor: string;
  action: string;
  detail: string;
}

export function auditQuarantine(
  persistence: MountPersistence,
  record: PreparedMountRecord,
  info: QuarantineInfo,
) {
  persistence.audit(record, info.actor, info.action, {
    outcome: "quarantined",
    detail: info.detail,
  });
}

export interface RefreshAuditInfo {
  record: PreparedMountRecord;
  actor: string;
  before: string | undefined;
  detail?: string;
}

export function auditRefresh(
  persistence: MountPersistence,
  info: RefreshAuditInfo,
) {
  const outcome = refreshOutcome(info.record, info.before, info.detail);
  persistence.audit(info.record, info.actor, "refresh", outcome);
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
