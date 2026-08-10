import { currentState } from "./daemon";
import { YashClient } from "./protocol/client";

export async function managedState(statePath: string) {
  const state = await currentState(statePath);
  if (!state || (await responds(state))) {
    return state;
  }
  throw new Error(
    `Recorded yafsd PID ${state.pid} is live but its endpoint is unavailable; refuse to signal it`,
  );
}

async function responds(state: { host: string; port: number }) {
  for (let i = 0; i < 3; i++) {
    if (await probe(state)) {
      return true;
    }
    await delayUnlessLast(i);
  }
  return false;
}

async function delayUnlessLast(attempt: number) {
  if (attempt < 2) {
    await delay(150);
  }
}

async function probe(state: { host: string; port: number }) {
  try {
    const client = await YashClient.connect(state);
    await client.exec("version");
    await client.close();
    return true;
  } catch {
    return false;
  }
}

export async function waitForStop(statePath: string, pid: number) {
  await waitUntil(
    () => !currentState(statePath) || !processAlive(pid),
    "Timed out stopping yafsd",
  );
}

export async function waitUntil(
  check: () => Promise<unknown> | unknown,
  message: string,
) {
  if (!(await pollUntil(check))) {
    throw new Error(message);
  }
}

async function pollUntil(check: () => Promise<unknown> | unknown) {
  for (let count = 0; count < 30; count++) {
    if (await check()) {
      return true;
    }
    await delay(100);
  }
  return false;
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
