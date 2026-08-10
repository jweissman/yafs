import { readFile } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { currentState } from "./daemon";
import { delay } from "./DaemonHealth";

type StatePaths = { state: string; log: string };

export async function waitForState(
  child: ChildProcess,
  statePaths: StatePaths,
) {
  if (!(await pollForState(child, statePaths))) {
    throw new Error(`Timed out starting yafsd; see ${statePaths.log}`);
  }
}

async function pollForState(child: ChildProcess, statePaths: StatePaths) {
  for (let count = 0; count < 30; count++) {
    if (await tick(child, statePaths)) {
      return true;
    }
    await delay(100);
  }
  return false;
}

async function tick(child: ChildProcess, statePaths: StatePaths) {
  if (await currentState(statePaths.state)) {
    return true;
  }
  if (child.exitCode !== null) {
    throw await startupFailure(statePaths);
  }
  return false;
}

async function startupFailure(statePaths: StatePaths) {
  const line = await errorLine(statePaths);
  return new Error(line || `yafsd failed to start; see ${statePaths.log}`);
}

async function errorLine(statePaths: StatePaths) {
  try {
    return lastError(await readFile(statePaths.log, "utf8"));
  } catch {
    return undefined;
  }
}

function lastError(content: string) {
  const line = [...content.trim().split("\n")]
    .reverse()
    .find((entry) => entry.startsWith("error:"));
  return line && `yafsd failed to start: ${line.slice("error:".length).trim()}`;
}
