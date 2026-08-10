import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validate } from "./DaemonStateValidation";

export type DaemonState = {
  version: 1;
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  instanceId: string;
  configPath?: string;
};

export function paths(dataDir: string) {
  const directory = resolve(dataDir);
  return {
    directory,
    state: `${directory}/daemon.json`,
    log: `${directory}/daemon.log`,
  };
}

export async function readState(
  path: string,
): Promise<DaemonState | undefined> {
  try {
    return validate(JSON.parse(await readFile(path, "utf8")));
  } catch (error: unknown) {
    return absentState(error);
  }
}

export async function writeState(
  path: string,
  address: { host: string; port: number },
  configPath?: string,
) {
  const state = newState(address, configPath);
  await replace(path, `${path}.${state.instanceId}.tmp`, JSON.stringify(state));
  return state;
}

export async function clearState(path: string, instanceId?: string) {
  if (!instanceId || (await readState(path))?.instanceId === instanceId) {
    await ignoreMissing(() => unlink(path));
  }
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function currentState(
  path: string,
): Promise<DaemonState | undefined> {
  const state = await readState(path);
  if (!state || isRunning(state.pid)) {
    return state;
  }
  return removeStaleState(path);
}

async function removeStaleState(path: string) {
  await clearState(path);
  return undefined;
}

function newState(
  address: { host: string; port: number },
  configPath?: string,
): DaemonState {
  return { ...identity(), ...address, ...(configPath && { configPath }) };
}

function identity() {
  return {
    version: 1 as const,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    instanceId: randomUUID(),
  };
}

async function replace(path: string, temporary: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, contents);
  await rename(temporary, path);
  await syncDirectory(path);
}

function absentState(error: unknown): undefined {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return undefined;
  }
  throw error;
}

async function ignoreMissing(action: () => Promise<void>) {
  try {
    await action();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function syncDirectory(path: string) {
  const directory = await open(dirname(path), "r");
  await directory.sync();
  await directory.close();
}
