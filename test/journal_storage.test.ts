import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquireLock } from "../src/protocol/JournalStorage";

test("acquireLock recovers a lock left behind by a process that is no longer running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-lock-"));
  const path = join(directory, "journal.lock");
  await writeFile(path, "999999999\n");
  await acquireLock(path);
  expect((await readFile(path, "utf8")).trim()).toBe(String(process.pid));
});
