import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

import { MountRecord, PreparedMountRecord } from "./types";
import { appendSynced, syncDirectory, writeSynced } from "../core/SyncedFileIO";

type StoredMounts = { version: 1; mounts: PreparedMountRecord[] };
export type AuditOutcome = {
  outcome: string;
  before?: string;
  after?: string;
  detail?: string;
};
type AuditEvent = {
  record: MountRecord;
  actor: string;
  action: string;
  outcome: AuditOutcome;
};

export class MountPersistence {
  private sequence = 0;

  constructor(
    private readonly statePath?: string,
    private readonly auditPath?: string,
  ) {
    this.sequence = auditSequence(auditPath);
  }

  restore(): PreparedMountRecord[] {
    return this.statePath && existsSync(this.statePath)
      ? this.parse(this.statePath)
      : [];
  }

  save(mounts: PreparedMountRecord[]) {
    if (!this.statePath) {
      return;
    }
    writeMounts(this.statePath, mounts);
  }

  audit(
    record: MountRecord,
    actor: string,
    action: string,
    outcome: AuditOutcome = { outcome: "success" },
  ) {
    if (this.auditPath) {
      this.appendAudit({ record, actor, action, outcome });
    }
  }

  private appendAudit(event: AuditEvent) {
    const path = this.auditPath!;
    mkdirSync(dirname(path), { recursive: true });
    appendSynced(path, this.auditLine(event));
  }

  private auditLine(event: AuditEvent) {
    return `${JSON.stringify(this.event(event))}\n`;
  }

  private parse(path: string) {
    return valid(JSON.parse(readFileSync(path, "utf8")) as StoredMounts);
  }

  private event(event: AuditEvent) {
    return {
      ...this.eventIdentity(event.record, event.actor, ++this.sequence),
      ...this.eventFields(event),
    };
  }

  private eventFields({ record, action, outcome }: AuditEvent) {
    return {
      action,
      relativePath: "",
      capabilitiesUsed: record.capabilities,
      outcome: outcome.outcome,
      ...revisionFields(outcome),
      detail: outcome.detail,
    };
  }

  private eventIdentity(record: MountRecord, actor: string, sequence: number) {
    return {
      sequence,
      at: new Date().toISOString(),
      actor,
      mountId: record.id,
      provider: record.provider,
      correlationId: record.correlationId,
    };
  }
}

function valid(stored: StoredMounts) {
  if (stored.version !== 1 || !Array.isArray(stored.mounts)) {
    throw new Error("Invalid mount state");
  }
  if (!stored.mounts.every(hasSnapshot)) {
    throw new Error("Mount state requires published snapshots");
  }
  return stored.mounts;
}

function revisionFields(outcome: AuditOutcome) {
  return { beforeRevision: outcome.before, afterRevision: outcome.after };
}

function hasSnapshot(record: PreparedMountRecord) {
  return Array.isArray(record.snapshot?.entries);
}

function writeMounts(path: string, mounts: PreparedMountRecord[]) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeSynced(
    temporary,
    JSON.stringify({ version: 1, mounts } satisfies StoredMounts),
  );
  renameSync(temporary, path);
  syncDirectory(path);
}

function auditSequence(path?: string) {
  if (!path || !existsSync(path)) {
    return 0;
  }
  const last = readFileSync(path, "utf8").trim().split("\n").at(-1);
  return last ? Number((JSON.parse(last) as { sequence: number }).sequence) : 0;
}
