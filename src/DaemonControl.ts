import { clearState } from "./daemon";
import { managedState, waitForStop } from "./DaemonHealth";

interface StatePaths {
  state: string;
  directory: string;
}

export async function stopDaemon(
  statePaths: StatePaths,
  report: (value: string) => void,
) {
  const state = await managedState(statePaths.state);
  if (state) {
    await terminate(statePaths, state);
  }
  report("stopped");
}

async function terminate(
  statePaths: StatePaths,
  state: { pid: number; instanceId: string },
) {
  process.kill(state.pid, "SIGTERM");
  await waitForStop(statePaths.state, state.pid);
  await clearState(statePaths.state, state.instanceId);
}

export async function statusOf(
  statePaths: StatePaths,
  report: (value: string) => void,
) {
  report((await managedState(statePaths.state)) ? "running" : "stopped");
}
