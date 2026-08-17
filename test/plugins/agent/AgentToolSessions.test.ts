import { expect, test } from "bun:test";

import { AgentToolSessions } from "../../../src/plugins/agent/AgentToolSessions";

test("a transport close callback clears its session bookkeeping", () => {
  const sessions = new AgentToolSessions();
  const transport = sessions.create();
  transport.onclose?.();
  expect(sessions.find(undefined)).toBeUndefined();
  sessions.close();
});
