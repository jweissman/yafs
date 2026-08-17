import { agentError } from "../agent/AgentError";

export interface OutboxStatus {
  state: "queued" | "running" | "succeeded" | "failed" | "unknown";
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export function queuedStatus(startedAt: string): OutboxStatus {
  return { state: "queued", startedAt };
}

export function runningStatus(startedAt: string): OutboxStatus {
  return { state: "running", startedAt };
}

export function succeededStatus(startedAt: string): OutboxStatus {
  return { state: "succeeded", startedAt, completedAt: now() };
}

export function failedStatus(startedAt: string, error: unknown): OutboxStatus {
  return {
    state: "failed",
    startedAt,
    completedAt: now(),
    error: agentError(error),
  };
}

// A crash mid-flight leaves genuine ambiguity a restart cannot resolve on
// its own: the post may have already reached Slack. Marking this "unknown"
// rather than silently retrying (which could double-post) or silently
// dropping (which could lose a record of the attempt) is the whole point
// of this ledger existing.
const UNKNOWN_ERROR =
  "Daemon restarted while this action was in flight; check Slack directly";

export function unknownStatus(startedAt: string): OutboxStatus {
  return {
    state: "unknown",
    startedAt,
    completedAt: now(),
    error: UNKNOWN_ERROR,
  };
}

function now() {
  return new Date().toISOString();
}
