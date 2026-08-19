import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { loggedEntries, waitForLogEntry } from "./logging_helpers";
import { log } from "../src/Logging";

test("loggedEntries runs the action and returns the entries it logged", async () => {
  const entries = await loggedEntries(async () => {
    log.info({}, "logging_helpers: loggedEntries happy path");
  });
  expect(
    entries.some(
      (entry) => entry.message === "logging_helpers: loggedEntries happy path",
    ),
  ).toBe(true);
});

test("loggedEntries tolerates a rejecting action and still returns entries", async () => {
  const entries = await loggedEntries(() => Promise.reject(new Error("x")));
  expect(Array.isArray(entries)).toBe(true);
});

test("waitForLogEntry resolves once a matching entry appears", async () => {
  log.info({}, "logging_helpers: waitForLogEntry match");
  const found = await waitForLogEntry(
    (entry) => entry.message === "logging_helpers: waitForLogEntry match",
  );
  expect(found.message).toBe("logging_helpers: waitForLogEntry match");
});

test("waitForLogEntry times out when no matching entry ever appears", async () => {
  await expect(waitForLogEntry(() => false, 30)).rejects.toThrow(
    "Timed out waiting for a matching log entry",
  );
});

test("reading log entries tolerates the file not existing yet", async () => {
  await rm(".yafs-test/test.jsonl", { force: true });
  await expect(waitForLogEntry(() => false, 30)).rejects.toThrow(
    "Timed out waiting for a matching log entry",
  );
});
