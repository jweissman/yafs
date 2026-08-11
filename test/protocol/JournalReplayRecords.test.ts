import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  replay,
  discardTornFinalRecord,
} from "../../src/protocol/JournalReplayRecords";
import { checksum } from "../../src/protocol/JournalChecksum";
import { NodeStore } from "../../src/vfs/NodeStore";

test("discardTornFinalRecord rethrows a non-missing-file read error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-replay-eisdir-"));
  await expect(discardTornFinalRecord(directory)).rejects.toThrow();
});

test("replay rejects a record whose checksum does not match its data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-replay-checksum-"));
  const walPath = join(directory, "journal.ndjson");
  const record = signedRecord(1);
  record.checksum = "not-the-real-checksum";
  await writeFile(walPath, JSON.stringify(record) + "\n");
  await expect(replay(walPath, { store: new NodeStore() }, 0)).rejects.toThrow(
    "Corrupt journal record",
  );
});

test("replay rejects a record whose sequence skips ahead of the expected next value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-replay-gap-"));
  const walPath = join(directory, "journal.ndjson");
  await writeFile(walPath, JSON.stringify(signedRecord(5)) + "\n");
  await expect(replay(walPath, { store: new NodeStore() }, 0)).rejects.toThrow(
    "Corrupt journal record",
  );
});

function signedRecord(sequence: number) {
  const data = {
    version: 1 as const,
    sequence,
    operation: { type: "touch" as const, path: "/home/root/note", at: now() },
  };
  return { ...data, checksum: checksum(data) };
}

function now() {
  return new Date().toISOString();
}
