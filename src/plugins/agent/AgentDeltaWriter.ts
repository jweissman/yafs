import { AgentRunStore } from "./AgentRunStore";
import { RunContext } from "./AgentTarget";

const DELTA_COMMIT_INTERVAL_MS = 100;
type Deps = { runs: AgentRunStore; context: RunContext };
type DeltaState = { lastCommitAt: number; buffer: string };

export function deltaWriter(runs: AgentRunStore, context: RunContext) {
  const state: DeltaState = { lastCommitAt: 0, buffer: "" };
  return (delta: string) => onDelta({ runs, context }, state, delta);
}

function onDelta(deps: Deps, state: DeltaState, delta: string) {
  state.buffer += delta;
  if (due(state)) {
    commit(deps, state);
  }
}

function due(state: DeltaState) {
  return Date.now() - state.lastCommitAt >= DELTA_COMMIT_INTERVAL_MS;
}

function commit(deps: Deps, state: DeltaState) {
  state.lastCommitAt = Date.now();
  void deps.runs.writeIncrementalResponse(deps.context, state.buffer);
}
