import { expect, test } from "bun:test";

import { parseChatArgs } from "../src/yash/chatArgs";

test("parses bare persona", () => {
  expect(parseChatArgs("reviewer")).toEqual({ persona: "reviewer" });
});

test("parses empty string as no persona", () => {
  expect(parseChatArgs("")).toEqual({});
});

test("parses --context and --chat with a persona", () => {
  const args = parseChatArgs(
    "reviewer --context reviews/482/diff.patch --chat abc",
  );
  expect(args).toEqual({
    persona: "reviewer",
    contextPath: "reviews/482/diff.patch",
    chatId: "abc",
  });
});

test("parses flags in either order without a persona", () => {
  const args = parseChatArgs("--chat abc --context path.txt");
  expect(args).toEqual({ contextPath: "path.txt", chatId: "abc" });
});

test("rejects unknown flags", () => {
  expect(() => parseChatArgs("--bogus x")).toThrow(
    "Unknown agent chat flag: --bogus",
  );
});

test("rejects a second bare token", () => {
  expect(() => parseChatArgs("reviewer extra")).toThrow(
    "Unexpected agent chat argument: extra",
  );
});

test("rejects a flag missing its value", () => {
  expect(() => parseChatArgs("reviewer --context")).toThrow(
    "--context requires a value",
  );
});
