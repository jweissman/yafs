import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function prepareJournal(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

export async function acquireLock(path: string) {
  try {
    await writeLockFile(path);
  } catch (error: unknown) {
    await recoverStaleLock(path, error as NodeJS.ErrnoException);
    return acquireLock(path);
  }
}

async function writeLockFile(path: string) {
  const file = await open(path, "wx");
  await file.writeFile(`${process.pid}\n`);
  await file.close();
}

async function recoverStaleLock(path: string, error: NodeJS.ErrnoException) {
  if (error.code !== "EEXIST") {
    throw error;
  }
  const pid = await lockPid(path);
  if (live(pid)) {
    throw new Error(`WAL lock is held by live PID ${pid}: ${path}`);
  }
  await unlink(path);
}

export async function appendAndSync(path: string, records: unknown[]) {
  const file = await open(path, "a");
  await file.writeFile(
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  await file.sync();
  await file.close();
}

export async function truncateAndSync(path: string) {
  const file = await open(path, "w");
  await file.sync();
  await file.close();
}

export async function removeIfPresent(path: string) {
  try {
    await unlink(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function writeAtomically(path: string, data: string) {
  const temporary = `${path}.tmp`;
  await writeSynced(temporary, data);
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function writeSynced(path: string, data: string) {
  const file = await open(path, "w");
  await file.writeFile(data);
  await file.sync();
  await file.close();
}

async function syncDirectory(path: string) {
  const directory = await open(path, "r");
  await directory.sync();
  await directory.close();
}

async function lockPid(path: string) {
  return Number((await readFile(path, "utf8")).trim());
}

function live(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
