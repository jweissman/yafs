import { AgentRunStore } from "./AgentRunStore";
import { RunContext } from "./AgentTarget";

const DELTA_COMMIT_INTERVAL_MS = 100;

export function deltaWriter(runs: AgentRunStore, context: RunContext) {
  let lastCommitAt = 0;
  let buffer = "";
  return (delta: string) => {
    buffer += delta;
    if (Date.now() - lastCommitAt < DELTA_COMMIT_INTERVAL_MS) {
      return;
    }
    lastCommitAt = Date.now();
    void runs.writeIncrementalResponse(context, buffer);
  };
}
