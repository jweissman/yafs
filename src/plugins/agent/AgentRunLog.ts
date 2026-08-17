import { RunContext } from "./AgentTarget";

// Run failures were previously silent server-side -- the only way to
// notice one happened was to already know the runId and go read
// status.json. A timeout or a rejected tool call should be visible in
// `yafsd logs -f` as it happens, not just discoverable after the fact.
export function logRun(
  context: RunContext,
  state: "complete" | "failed",
  error?: unknown,
) {
  console.log(runLogLine(context, state, error));
}

function runLogLine(
  context: RunContext,
  state: "complete" | "failed",
  error: unknown,
): string {
  const { mountId, personaName, runId } = context;
  const detail = error instanceof Error ? `: ${error.message}` : "";
  return `agent run ${state}: persona=${mountId}/${personaName} runId=${runId}${detail}`;
}
