import { expect, test } from "bun:test";

import { assertEntry, assertPath } from "../../src/traces/TraceEntryValidation";

test("assertPath rejects an empty path", () => {
  expect(() => assertPath("")).toThrow("Invalid trace entry path");
});

test("assertPath rejects an absolute path", () => {
  expect(() => assertPath("/etc/passwd")).toThrow("Invalid trace entry path");
});

test("assertPath rejects . and .. segments", () => {
  expect(() => assertPath("a/./b")).toThrow("Invalid trace entry path");
  expect(() => assertPath("a/../b")).toThrow("Invalid trace entry path");
});

test("assertPath accepts an ordinary relative path", () => {
  expect(() => assertPath("a/b/c.txt")).not.toThrow();
});

test("assertEntry rejects an invalid digest even with a valid path", () => {
  expect(() => assertEntry({ path: "a.txt", digest: "not-a-digest" })).toThrow(
    "Invalid trace digest",
  );
});

test("assertEntry accepts a valid path and a well-formed digest", () => {
  const digest = "a".repeat(64);
  expect(() => assertEntry({ path: "a.txt", digest })).not.toThrow();
});
