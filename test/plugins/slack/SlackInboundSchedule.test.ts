import { expect, test } from "bun:test";

import {
  advanceCursor,
  baselineCursor,
  mentions,
  newMessages,
  stripMention,
} from "../../../src/plugins/slack/SlackInboundSchedule";

test("filters out the bot's own messages and anything already seen", () => {
  const messages = [
    { user: "BOT", text: "<@BOT> self", ts: "3.0" },
    { user: "U1", text: "<@BOT> already seen", ts: "1.0" },
    { user: "U2", text: "<@BOT> new", ts: "2.0" },
  ];
  expect(newMessages("BOT", { lastTs: "1.0" }, messages)).toEqual([
    { user: "U2", text: "<@BOT> new", ts: "2.0" },
  ]);
});

test("excludes messages that don't mention the bot, even if otherwise new", () => {
  const messages = [{ user: "U1", text: "no mention here", ts: "1.0" }];
  expect(newMessages("BOT", {}, messages)).toEqual([]);
});

test("a fresh cursor does not replay the whole channel history as new", () => {
  const messages = [
    { user: "U1", text: "unrelated chatter", ts: "1.0" },
    { user: "U2", text: "more chatter", ts: "2.0" },
    { user: "U3", text: "<@BOT> can you help", ts: "3.0" },
  ];
  expect(newMessages("BOT", {}, messages)).toEqual([
    { user: "U3", text: "<@BOT> can you help", ts: "3.0" },
  ]);
});

test("returns mentioning messages in ascending ts order regardless of input order", () => {
  const messages = [
    { user: "U1", text: "<@BOT> second", ts: "2.0" },
    { user: "U1", text: "<@BOT> first", ts: "1.0" },
  ];
  expect(newMessages("BOT", {}, messages)).toEqual([
    { user: "U1", text: "<@BOT> first", ts: "1.0" },
    { user: "U1", text: "<@BOT> second", ts: "2.0" },
  ]);
});

test("requireMention: false admits messages that never mention the bot", () => {
  const messages = [{ user: "U1", text: "no mention here", ts: "1.0" }];
  expect(newMessages("BOT", {}, messages, false)).toEqual(messages);
});

test("mentions and stripMention agree on the same token", () => {
  expect(mentions("BOT", "<@BOT> hi")).toBe(true);
  expect(mentions("BOT", "hi")).toBe(false);
  expect(stripMention("BOT", "<@BOT> hi there")).toBe("hi there");
});

test("advanceCursor moves to the latest of the new messages", () => {
  const fresh = [
    { user: "U1", text: "<@BOT> a", ts: "1.0" },
    { user: "U1", text: "<@BOT> b", ts: "2.0" },
  ];
  expect(advanceCursor({}, fresh)).toEqual({ lastTs: "2.0" });
});

test("advanceCursor leaves the cursor untouched when nothing is new", () => {
  expect(advanceCursor({ lastTs: "5.0" }, [])).toEqual({ lastTs: "5.0" });
});

test("baselineCursor points past every message already in the window", () => {
  const messages = [
    { user: "U1", text: "<@BOT> old mention", ts: "1.0" },
    { user: "U2", text: "chatter", ts: "3.0" },
    { user: "U3", text: "<@BOT> also old", ts: "2.0" },
  ];
  expect(baselineCursor(messages)).toEqual({ lastTs: "3.0" });
});

test("baselineCursor on an empty channel leaves the cursor unset", () => {
  expect(baselineCursor([])).toEqual({});
});
