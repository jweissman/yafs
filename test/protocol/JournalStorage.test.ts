import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireLock,
  removeIfPresent,
} from "../../src/protocol/JournalStorage";

test("acquireLock recovers a lock left behind by a process that is no longer running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-lock-"));
  const path = join(directory, "journal.lock");
  await writeFile(path, "999999999\n");
  await acquireLock(path);
  expect((await readFile(path, "utf8")).trim()).toBe(String(process.pid));
});

test("acquireLock identifies a live owner without replacing its WAL lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-lock-"));
  const path = join(directory, "journal.lock");
  await writeFile(path, `${process.pid}\n`);
  await expect(acquireLock(path)).rejects.toThrow(
    `WAL lock is held by live PID ${process.pid}`,
  );
  expect((await readFile(path, "utf8")).trim()).toBe(String(process.pid));
});

test("acquireLock rethrows a failure that isn't a pre-existing lock file", async () => {
  const path = join(
    await mkdtemp(join(tmpdir(), "yafs-lock-")),
    "missing-dir/journal.lock",
  );
  await expect(acquireLock(path)).rejects.toThrow();
});

test("removeIfPresent is a no-op when the path is already absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-remove-"));
  await expect(
    removeIfPresent(join(directory, "never-existed")),
  ).resolves.toBeUndefined();
});

test("removeIfPresent rethrows a failure that isn't a missing file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-remove-"));
  await expect(removeIfPresent(directory)).rejects.toThrow();
});
