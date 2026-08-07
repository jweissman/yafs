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
    if (i < 2) {
      await delay(150);
    }
  }
  return false;
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
  for (let count = 0; count < 30; count++) {
    if (await check()) {
      return;
    }
    await delay(100);
  }
  throw new Error(message);
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
