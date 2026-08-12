import { expect, test } from "bun:test";

import { parseSlackAction } from "../../../src/plugins/slack/SlackAction";

test("parses a message with an explicit actionId", () => {
  expect(parseSlackAction('{"message":"hi","actionId":"abc"}')).toEqual({
    message: "hi",
    actionId: "abc",
  });
});

test("parses a message without an actionId", () => {
  expect(parseSlackAction('{"message":"hi"}')).toEqual({
    message: "hi",
    actionId: undefined,
  });
});

test("rejects a payload without a message", () => {
  expect(() => parseSlackAction("{}")).toThrow("Invalid slack action");
});

test("rejects a non-string actionId", () => {
  expect(() => parseSlackAction('{"message":"hi","actionId":7}')).toThrow(
    "Invalid slack action",
  );
});
