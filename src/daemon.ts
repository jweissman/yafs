import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "./DaemonStateValidation";
import { absentState, ignoreMissing, newState, replace } from "./DaemonStateIO";

export type { DaemonState } from "./DaemonStateIO";

export function paths(dataDir: string) {
  const directory = resolve(dataDir);
  return {
    directory,
    state: `${directory}/daemon.json`,
    log: `${directory}/daemon.log`,
  };
}

export async function readState(path: string) {
  try {
    return validate(JSON.parse(await readFile(path, "utf8")));
  } catch (error: unknown) {
    absentState(error);
    return;
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

export async function currentState(path: string) {
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
