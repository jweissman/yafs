import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  restoreJournal,
  writeSnapshot,
} from "../../src/protocol/JournalRecovery";
import { NodeStore } from "../../src/vfs/NodeStore";

test("restoreJournal rejects a snapshot with a mismatched checksum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-snapshot-corrupt-"));
  const snapshotPath = join(directory, "snapshot.json");
  const walPath = join(directory, "journal.ndjson");
  await writeSnapshot(snapshotPath, root());
  await writeFile(walPath, "");
  await corrupt(snapshotPath);
  await expect(
    restoreJournal(walPath, snapshotPath, new NodeStore()),
  ).rejects.toThrow("Corrupt snapshot");
});

test("restoreJournal rethrows a non-missing-file read error instead of treating it as absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-snapshot-badjson-"));
  const snapshotPath = join(directory, "snapshot.json");
  const walPath = join(directory, "journal.ndjson");
  await writeFile(snapshotPath, "not json");
  await writeFile(walPath, "");
  await expect(
    restoreJournal(walPath, snapshotPath, new NodeStore()),
  ).rejects.toThrow();
});

function root() {
  const now = new Date().toISOString();
  return {
    version: 1 as const,
    sequence: 0,
    root: { name: "", dir: true, createdAt: now, modifiedAt: now },
  };
}

async function corrupt(path: string) {
  const stored = JSON.parse(await Bun.file(path).text());
  stored.checksum = "not-a-real-checksum";
  await writeFile(path, JSON.stringify(stored));
}
