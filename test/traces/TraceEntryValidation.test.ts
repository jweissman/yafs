import { expect, test } from "bun:test";

import {
  assertEntry,
  assertPath,
  parseTrace,
} from "../../src/traces/TraceEntryValidation";

test("assertPath rejects an empty path", () => {
  expect(() => {
    assertPath("");
  }).toThrow("Invalid trace entry path");
});

test("assertPath rejects an absolute path", () => {
  expect(() => {
    assertPath("/etc/passwd");
  }).toThrow("Invalid trace entry path");
});

test("assertPath rejects . and .. segments", () => {
  expect(() => {
    assertPath("a/./b");
  }).toThrow("Invalid trace entry path");
  expect(() => {
    assertPath("a/../b");
  }).toThrow("Invalid trace entry path");
});

test("assertPath accepts an ordinary relative path", () => {
  expect(() => {
    assertPath("a/b/c.txt");
  }).not.toThrow();
});

test("assertEntry rejects an invalid digest even with a valid path", () => {
  expect(() => {
    assertEntry({ path: "a.txt", digest: "not-a-digest" });
  }).toThrow("Invalid trace digest");
});

test("assertEntry accepts a valid path and a well-formed digest", () => {
  const digest = "a".repeat(64);
  expect(() => {
    assertEntry({ path: "a.txt", digest });
  }).not.toThrow();
});

test("parseTrace rejects a manifest missing required fields", () => {
  expect(() => parseTrace(JSON.stringify({ kind: "yafs-trace" }))).toThrow(
    "Invalid trace manifest",
  );
});

test("parseTrace accepts a well-formed manifest and validates its entries", () => {
  const digest = "a".repeat(64);
  const trace = parseTrace(
    JSON.stringify({
      kind: "yafs-trace",
      version: 1,
      sourcePath: "/source",
      capturedAt: "2026-01-01T00:00:00.000Z",
      entries: [{ path: "a.txt", digest }],
    }),
  );
  expect(trace.entries).toEqual([{ path: "a.txt", digest }]);
});
