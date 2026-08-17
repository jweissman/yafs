import { AbsolutePath } from "../core/AbsolutePath";
import { CtlHandler } from "./CtlDispatch";
import { Wiring } from "../mounts/Plugin";
import { AgentToolServer } from "../plugins/agent/AgentToolServer";
import { defaultClients } from "./ServerClients";
import { backgroundDrivers, BackgroundDrivers } from "./BackgroundDrivers";
import { ServerConnection } from "./ServerConnection";
import { Services, StartOptions } from "./ServerTypes";

export interface ServerBindings {
  services: Services;
  connection: ServerConnection;
  toolServer: AgentToolServer;
  registerCtl: (path: AbsolutePath, handler: CtlHandler) => void;
  unregisterCtl: (path: AbsolutePath) => void;
  dispatchCtl: (path: AbsolutePath, payload: string) => Promise<boolean>;
}

export function serverBindings(
  services: Services,
  connection: ServerConnection,
  toolServer: AgentToolServer,
): ServerBindings {
  return { services, connection, toolServer, ...ctlBindings(connection) };
}

function ctlBindings(connection: ServerConnection) {
  return {
    registerCtl: registerCtl(connection),
    unregisterCtl: unregisterCtl(connection),
    dispatchCtl: dispatchCtl(connection),
  };
}

function registerCtl(connection: ServerConnection) {
  return (path: AbsolutePath, handler: CtlHandler) => {
    connection.ctl.register(path, handler);
  };
}

function unregisterCtl(connection: ServerConnection) {
  return (path: AbsolutePath) => {
    connection.ctl.unregister(path);
  };
}

function dispatchCtl(connection: ServerConnection) {
  return (path: AbsolutePath, payload: string) =>
    connection.ctl.invoke(path, payload);
}

export function driversFor(
  bindings: ServerBindings,
  options: StartOptions,
): BackgroundDrivers {
  const clients = defaultClients(options, bindings.toolServer);
  const timing = timingFrom(options);
  return backgroundDrivers(wiring(bindings), clients, timing);
}

function timingFrom(options: StartOptions) {
  return {
    now: options.now,
    refreshIntervalMs: options.refreshIntervalMs,
    slackPollIntervalMs: options.slackPollIntervalMs,
  };
}

function wiring(bindings: ServerBindings): Wiring {
  return {
    mounts: bindings.services.mounts,
    journal: bindings.services.journal,
    enqueue: (work) => bindings.connection.enqueueWork(work),
    registerCtl: bindings.registerCtl,
    unregisterCtl: bindings.unregisterCtl,
    dispatchCtl: bindings.dispatchCtl,
  };
}
