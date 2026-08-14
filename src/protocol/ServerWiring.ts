import { AbsolutePath } from "../core/AbsolutePath";
import { CtlHandler } from "./CtlDispatch";
import { Wiring } from "../mounts/Plugin";
import { AgentToolServer } from "../plugins/agent/AgentToolServer";
import { defaultClients } from "./ServerClients";
import { backgroundDrivers, BackgroundDrivers } from "./BackgroundDrivers";
import { ServerConnection } from "./ServerConnection";
import { Services, StartOptions } from "./ServerTypes";

export type ServerBindings = {
  services: Services;
  connection: ServerConnection;
  toolServer: AgentToolServer;
  registerCtl: (path: AbsolutePath, handler: CtlHandler) => void;
  unregisterCtl: (path: AbsolutePath) => void;
  dispatchCtl: (path: AbsolutePath, payload: string) => Promise<boolean>;
};

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
    enqueue: bindings.connection.enqueueWork.bind(bindings.connection),
    registerCtl: bindings.registerCtl,
    unregisterCtl: bindings.unregisterCtl,
    dispatchCtl: bindings.dispatchCtl,
  };
}
