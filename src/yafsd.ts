import { mkdir, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { paths } from "./daemon";
import { configArgument, restartConfig, selectedConfig } from "./DaemonConfig";
import { managedState } from "./DaemonHealth";
import { waitForState } from "./DaemonStartup";
import { printLogs } from "./DaemonLogs";
import { toolsPort } from "./plugins/agent/AgentToolServer";
import { defaultMcpJsonPath } from "./plugins/agent/LmStudioMcpJson";
import { statusOf, stopDaemon } from "./DaemonControl";
import { serve } from "./DaemonServe";

const command = process.argv[2] || "serve";
const settings = {
  host: process.env.YAFS_HOST || "127.0.0.1",
  port: Number(process.env.YAFS_PORT || 7337),
  dataDir: process.env.YAFS_DATA_DIR || ".yafs",
  configPath: selectedConfig(process.argv, process.env),
  toolsPort: toolsPort(),
  mcpJsonPath: defaultMcpJsonPath(),
};
const statePaths = paths(settings.dataDir);
const commands = { serve: serveCommand, start, stop, restart, status, logs };
await (commands[command] || usage)();
function serveCommand() {
  return serve(settings, statePaths);
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

function stop() {
  return stopDaemon(statePaths, report);
}

async function restart() {
  const configPath = restartConfig(
    settings.configPath,
    await managedState(statePaths.state),
  );
  await stop();
  await start(configPath);
}

function status() {
  return statusOf(statePaths, report);
}

function logs() {
  return printLogs(statePaths.log, process.argv.slice(3));
}

function usage(): never {
  throw new Error(
    "Usage: yafsd [serve|start|stop|restart|status|logs [-f|--tail] [-n N]] " +
      "[--config FILE]",
  );
}

function report(value: string) {
  console.log(`yafsd ${value}; data: ${statePaths.directory}`);
}
