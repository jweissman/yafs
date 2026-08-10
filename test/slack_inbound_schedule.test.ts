import { expect, test } from "bun:test";

import { advanceCursor, newMessages } from "../src/plugins/slack/SlackInboundSchedule";

test("filters out the bot's own messages and anything already seen", () => {
  const messages = [
    { user: "BOT", text: "self", ts: "3.0" },
    { user: "U1", text: "already seen", ts: "1.0" },
    { user: "U2", text: "new", ts: "2.0" },
  ];
  expect(newMessages("BOT", { lastTs: "1.0" }, messages)).toEqual([
    { user: "U2", text: "new", ts: "2.0" },
  ]);
});

test("returns messages in ascending ts order regardless of input order", () => {
  const messages = [
    { user: "U1", text: "second", ts: "2.0" },
    { user: "U1", text: "first", ts: "1.0" },
  ];
  expect(newMessages("BOT", {}, messages)).toEqual([
    { user: "U1", text: "first", ts: "1.0" },
    { user: "U1", text: "second", ts: "2.0" },
  ]);
});

test("an unset cursor admits every non-bot message", () => {
  const messages = [{ user: "U1", text: "hi", ts: "1.0" }];
  expect(newMessages("BOT", {}, messages)).toEqual(messages);
});

test("advanceCursor moves to the latest of the new messages", () => {
  const fresh = [
    { user: "U1", text: "a", ts: "1.0" },
    { user: "U1", text: "b", ts: "2.0" },
  ];
  expect(advanceCursor({}, fresh)).toEqual({ lastTs: "2.0" });
});

test("advanceCursor leaves the cursor untouched when nothing is new", () => {
  expect(advanceCursor({ lastTs: "5.0" }, [])).toEqual({ lastTs: "5.0" });
});
