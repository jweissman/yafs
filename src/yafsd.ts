import { mkdir, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { clearState, paths, writeState } from "./daemon";
import { configArgument, restartConfig, selectedConfig } from "./DaemonConfig";
import { YafsServer } from "./protocol/server";
import { managedState, waitForStop } from "./DaemonHealth";
import { waitForState } from "./DaemonStartup";

const command = process.argv[2] || "serve";
const settings = {
  host: process.env.YAFS_HOST || "127.0.0.1",
  port: Number(process.env.YAFS_PORT || 7337),
  dataDir: process.env.YAFS_DATA_DIR || ".yafs",
  configPath: selectedConfig(process.argv, process.env),
};
const statePaths = paths(settings.dataDir);
await ({ serve, start, stop, restart, status }[command] || usage)();
async function serve() {
  if (await managedState(statePaths.state)) {
    throw new Error(`yafsd already running for ${statePaths.directory}`);
  }
  const server = await startServer();
  const state = await announce(server);
  await waitForSignal();
  await server.close();
  await clearState(statePaths.state, state.instanceId);
}
async function startServer() {
  try {
    return await YafsServer.start(settings);
  } catch (error) {
    throw isAddressInUse(error) ? addressInUseError() : error;
  }
}

function isAddressInUse(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === "EADDRINUSE",
  );
}

function addressInUseError() {
  return new Error(
    `Port ${settings.host}:${settings.port} is already in use; another yafsd ` +
      "(perhaps a different data directory, or one started outside this lifecycle) may already be listening",
  );
}

async function announce(server: YafsServer) {
  const address = server.address();
  const state = await writeState(
    statePaths.state,
    address,
    settings.configPath,
  );
  logListening(address);
  return state;
}

function logListening(address: { host: string; port: number }) {
  console.log(
    `yafsd listening on ${address.host}:${address.port}; data: ${statePaths.directory}`,
  );
}

async function start(configPath = settings.configPath) {
  if (await managedState(statePaths.state)) {
    return report("running");
  }
  const launched = await launch(configPath);
  await waitForState(launched.child, statePaths, launched.logOffset);
  report("started");
}

async function launch(configPath?: string) {
  await mkdir(statePaths.directory, { recursive: true });
  const log = await open(statePaths.log, "a");
  const logOffset = (await log.stat()).size;
  return { child: detach(log, configPath), logOffset };
}

function detach(log: Awaited<ReturnType<typeof open>>, configPath?: string) {
  const child = spawn(
    process.execPath,
    [import.meta.path, "serve", ...configArgument(configPath)],
    { detached: true, stdio: ["ignore", log.fd, log.fd], env: process.env },
  );
  child.unref();
  void log.close();
  return child;
}

async function stop() {
  const state = await managedState(statePaths.state);
  if (!state) {
    return report("stopped");
  }
  process.kill(state.pid, "SIGTERM");
  await waitForStop(statePaths.state, state.pid);
  await clearState(statePaths.state, state.instanceId);
  report("stopped");
}

async function restart() {
  const configPath = restartConfig(
    settings.configPath,
    await managedState(statePaths.state),
  );
  await stop();
  await start(configPath);
}

async function status() {
  report((await managedState(statePaths.state)) ? "running" : "stopped");
}

function usage(): never {
  throw new Error(
    "Usage: yafsd [serve|start|stop|restart|status] [--config FILE]",
  );
}

function report(value: string) {
  console.log(`yafsd ${value}; data: ${statePaths.directory}`);
}

function waitForSignal() {
  return new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
