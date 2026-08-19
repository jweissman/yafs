import { log } from "../../Logging";
import { RunContext } from "./AgentTarget";

const runLog = log.getSubLogger({ name: "agent.run" });

export function logRun(
  context: RunContext,
  state: "complete" | "failed",
  error?: unknown,
) {
  const { mountId, personaName, runId } = context;
  const fields = { mountId, personaName, runId, error: errorMessage(error) };
  runLog.info(fields, `agent run ${state}`);
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
