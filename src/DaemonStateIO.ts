import { randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type DaemonState = {
  version: 1;
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  instanceId: string;
  configPath?: string;
};

export function newState(
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

export async function replace(
  path: string,
  temporary: string,
  contents: string,
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, contents);
  await rename(temporary, path);
  await syncDirectory(path);
}

async function syncDirectory(path: string) {
  const directory = await open(dirname(path), "r");
  await directory.sync();
  await directory.close();
}

export function absentState(error: unknown): undefined {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return undefined;
  }
  throw error;
}

export async function ignoreMissing(action: () => Promise<void>) {
  try {
    await action();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
