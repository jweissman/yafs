import { YafsServer } from "./protocol/server";
import type { StartOptions } from "./protocol/server";
import { managedState } from "./DaemonHealth";
import { logStartup } from "./DaemonAnnounce";
import { addressInUseError, isAddressInUse } from "./DaemonAddressError";
import { clearState, paths, writeState } from "./daemon";

export type Settings = StartOptions & { host: string; port: number };
export type StatePaths = ReturnType<typeof paths>;

export async function serve(settings: Settings, statePaths: StatePaths) {
  if (await managedState(statePaths.state)) {
    throw new Error(`yafsd already running for ${statePaths.directory}`);
  }
  const server = await startServer(settings);
  const state = await announce(settings, statePaths, server);
  await waitForSignal();
  await server.close();
  await clearState(statePaths.state, state.instanceId);
}

async function startServer(settings: Settings) {
  try {
    return await YafsServer.start(settings);
  } catch (error) {
    throw isAddressInUse(error)
      ? addressInUseError(settings.host, settings.port)
      : error;
  }
}

async function announce(
  settings: Settings,
  statePaths: StatePaths,
  server: YafsServer,
) {
  const address = server.address();
  const state = await savedState(settings, statePaths, address);
  logStartup(address, statePaths.directory, server.agentToolsPort());
  return state;
}

function savedState(
  settings: Settings,
  statePaths: StatePaths,
  address: { host: string; port: number },
) {
  return writeState(statePaths.state, address, settings.configPath);
}

function waitForSignal() {
  return new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
