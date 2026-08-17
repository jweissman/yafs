import { MountRecord } from "./types";

export interface AuditOutcome {
  outcome: string;
  before?: string;
  after?: string;
  detail?: string;
}

export interface AuditEvent {
  record: MountRecord;
  actor: string;
  action: string;
  outcome: AuditOutcome;
}

export function auditLine(event: AuditEvent, sequence: number): string {
  return `${JSON.stringify(auditEnvelope(event, sequence))}\n`;
}

function auditEnvelope(event: AuditEvent, sequence: number) {
  return {
    ...eventIdentity(event.record, event.actor, sequence),
    ...eventFields(event),
  };
}

function eventFields({ record, action, outcome }: AuditEvent) {
  return {
    action,
    relativePath: "",
    capabilitiesUsed: record.capabilities,
    outcome: outcome.outcome,
    ...revisionFields(outcome),
    detail: outcome.detail,
  };
}

function eventIdentity(record: MountRecord, actor: string, sequence: number) {
  return {
    sequence,
    at: new Date().toISOString(),
    actor,
    mountId: record.id,
    provider: record.provider,
    correlationId: record.correlationId,
  };
}

function revisionFields(outcome: AuditOutcome) {
  return { beforeRevision: outcome.before, afterRevision: outcome.after };
}
