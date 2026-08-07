import { Status } from "./AgentRunStore";
import { agentError } from "./AgentError";

export function queuedStatus(startedAt: string): Status {
  return { state: "queued", startedAt };
}

export function runningStatus(startedAt: string): Status {
  return { state: "running", startedAt };
}

export function failedStatus(startedAt: string, error: unknown): Status {
  return {
    state: "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    error: agentError(error),
  };
}
