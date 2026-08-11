import { expect, test } from "bun:test";

import { deltaWriter } from "../../../src/plugins/agent/AgentDeltaWriter";
import type { AgentRunStore } from "../../../src/plugins/agent/AgentRunStore";
import type { RunContext } from "../../../src/plugins/agent/AgentTarget";

test("deltaWriter coalesces a rapid second delta instead of committing it immediately", () => {
  const commits: string[] = [];
  const onDelta = deltaWriter(recordingRunStore(commits), context());
  onDelta("a");
  onDelta("b");
  expect(commits).toEqual(["a"]);
});

function recordingRunStore(commits: string[]): AgentRunStore {
  return {
    writeIncrementalResponse: (_id: unknown, partial: string) => {
      commits.push(partial);
    },
  } as unknown as AgentRunStore;
}

function context(): RunContext {
  return {
    mountId: "agents",
    personaName: "reviewer",
    runId: "run-1",
    startedAt: "1970-01-01T00:00:00.000Z",
  };
}
