import { AgentRequest } from "./AgentRequest";
import { RunContext } from "./AgentTarget";

export function newRunContext(
  mountId: string,
  personaName: string,
  request: AgentRequest,
): RunContext {
  const startedAt = new Date().toISOString();
  const runId = request.runId || startedAt.replace(/[:.]/g, "-");
  return { mountId, personaName, runId, startedAt };
}
