import { expect, test } from "bun:test";

import {
  threadEntry,
  threadPath,
  threadResponseId,
} from "../../../src/plugins/agent/AgentToolThread";

test("threadPath is a per-chat file under the persona's chats directory", () => {
  expect(threadPath("reviewer", "chat-1")).toBe(
    "reviewer/chats/chat-1/lmstudio-response-id.txt",
  );
});

test("threadEntry pairs the path with the raw response id", () => {
  expect(threadEntry("reviewer", "chat-1", "resp_abc")).toEqual([
    "reviewer/chats/chat-1/lmstudio-response-id.txt",
    "resp_abc",
  ]);
});

test("threadResponseId reads a previously recorded id from a record's entries", () => {
  const record = fakeRecord([threadEntry("reviewer", "chat-1", "resp_abc")]);
  expect(threadResponseId(record, "reviewer", "chat-1")).toBe("resp_abc");
});

test("threadResponseId returns undefined when no id has been recorded yet", () => {
  const record = fakeRecord([]);
  expect(threadResponseId(record, "reviewer", "chat-1")).toBeUndefined();
});

function fakeRecord(entries: [string, string][]) {
  return {
    snapshot: { entries, fileCount: entries.length, byteCount: 0 },
  } as Parameters<typeof threadResponseId>[0];
}
