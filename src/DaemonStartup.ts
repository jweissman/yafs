import { readFile } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { currentState } from "./daemon";
import { delay } from "./DaemonHealth";
import { startupError } from "./DaemonStartupError";

type StatePaths = { state: string; log: string };
type Attempt = {
  child: ChildProcess; statePaths: StatePaths; logOffset: number;
};

export async function waitForState(
  child: ChildProcess,
  statePaths: StatePaths,
  logOffset = 0,
) {
  const attempt = { child, statePaths, logOffset };
  if (!(await pollForState(attempt))) {
    throw new Error(`Timed out starting yafsd; see ${statePaths.log}`);
  }
}

async function pollForState(attempt: Attempt) {
  for (let count = 0; count < 30; count++) {
    if (await tick(attempt)) {
      return true;
    }
    await delay(100);
  }
  return false;
}

async function tick(attempt: Attempt) {
  if (await currentState(attempt.statePaths.state)) {
    return true;
  }
  if (attempt.child.exitCode !== null) {
    throw await startupFailure(attempt);
  }
  return false;
}

async function startupFailure(attempt: Attempt) {
  const line = await errorLine(attempt);
  return new Error(line || `yafsd failed to start; see ${attempt.statePaths.log}`);
}

async function errorLine(attempt: Attempt) {
  try {
    return startupError(
      await readFile(attempt.statePaths.log, "utf8"), attempt.logOffset,
    );
  } catch {
    return undefined;
  }
}
