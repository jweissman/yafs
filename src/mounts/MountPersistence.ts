import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

import { MountRecord, PreparedMountRecord } from "./types";
import { appendSynced, syncDirectory, writeSynced } from "../core/SyncedFileIO";
import { auditLine, AuditEvent, AuditOutcome } from "./MountPersistenceAudit";

export type { AuditOutcome } from "./MountPersistenceAudit";

type StoredMounts = { version: 1; mounts: PreparedMountRecord[] };

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
    appendSynced(path, auditLine(event, ++this.sequence));
  }

  private parse(path: string) {
    return valid(JSON.parse(readFileSync(path, "utf8")) as StoredMounts);
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
