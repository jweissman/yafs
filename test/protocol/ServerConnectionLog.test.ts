import { expect, test } from "bun:test";

import { compact, logAbort } from "../../src/protocol/ServerConnectionLog";
import { Journal } from "../../src/protocol/Journal";
import { loggedEntries } from "../logging_helpers";

test("logAbort logs the unhandled command error", async () => {
  const entries = await loggedEntries(async () => {
    logAbort(new Error("boom"));
  });
  expect(
    entries.some(
      (entry) =>
        entry.message === "Unhandled command error" && entry.error === "boom",
    ),
  ).toBe(true);
});

test("compact logs, rather than throws, when journal compaction fails", async () => {
  const journal = {
    compact: async () => {
      throw new Error("disk full");
    },
  } as unknown as Journal;

  const entries = await loggedEntries(() => compact(journal, {} as never));

  expect(
    entries.some(
      (entry) =>
        entry.message === "Journal compaction failed" &&
        entry.error === "disk full",
    ),
  ).toBe(true);
});
