import { AbsolutePath } from "../core/AbsolutePath";
import { MountManager } from "../mounts/MountManager";
import { AgentConfig, PersonaConfig, SlackConfig } from "../mounts/types";
import { FixtureStreamDriver } from "../mounts/FixtureStreamDriver";
import { AgentDirectoryDriver } from "../agents/AgentDirectoryDriver";
import { ModelClient } from "../agents/ChatCompletionClient";
import {
  SlackDirectoryDriver,
  SlackPoster,
} from "../mounts/SlackDirectoryDriver";
import { ServerRefresh } from "./ServerRefresh";
import { CtlHandler } from "./CtlDispatch";
import { Journal } from "./Journal";

type Enqueue = (work: () => Promise<void>) => Promise<void>;
type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
export type ModelFor = (
  persona: PersonaConfig,
  mount: AgentConfig,
) => ModelClient;
export type SlackClientFor = (config: SlackConfig) => SlackPoster;
export type Wiring = {
  mounts: MountManager;
  journal: Journal;
  enqueue: Enqueue;
  registerCtl: RegisterCtl;
  unregisterCtl: UnregisterCtl;
};

export type BackgroundDrivers = {
  refreshes: ServerRefresh;
  streams: FixtureStreamDriver;
  agents: AgentDirectoryDriver;
  slack: SlackDirectoryDriver;
};

function refreshDriver(
  wiring: Wiring,
  now?: () => number,
  refreshIntervalMs?: number,
) {
  const { mounts, journal, enqueue } = wiring;
  return new ServerRefresh(mounts, journal, enqueue, now, refreshIntervalMs);
}

function streamsDriver(wiring: Wiring) {
  const { mounts, journal, enqueue, registerCtl, unregisterCtl } = wiring;
  return new FixtureStreamDriver(mounts, journal, enqueue, {
    registerCtl,
    unregisterCtl,
  });
}

function agentsDriver(wiring: Wiring, modelFor: ModelFor) {
  const { mounts, journal, enqueue, registerCtl, unregisterCtl } = wiring;
  return new AgentDirectoryDriver(
    mounts,
    journal,
    enqueue,
    { registerCtl, unregisterCtl },
    modelFor,
  );
}

function slackDriver(wiring: Wiring, slackClientFor: SlackClientFor) {
  const { mounts, journal, enqueue, registerCtl, unregisterCtl } = wiring;
  return new SlackDirectoryDriver(
    mounts,
    journal,
    enqueue,
    registerCtl,
    unregisterCtl,
    slackClientFor,
  );
}

export function backgroundDrivers(
  wiring: Wiring,
  modelFor: ModelFor,
  slackClientFor: SlackClientFor,
  now?: () => number,
  refreshIntervalMs?: number,
): BackgroundDrivers {
  return {
    refreshes: refreshDriver(wiring, now, refreshIntervalMs),
    streams: streamsDriver(wiring),
    agents: agentsDriver(wiring, modelFor),
    slack: slackDriver(wiring, slackClientFor),
  };
}

export function startAll(drivers: BackgroundDrivers) {
  drivers.refreshes.start();
  drivers.streams.start();
  drivers.agents.sync();
  drivers.slack.sync();
}

export function closeAll(drivers: BackgroundDrivers) {
  drivers.refreshes.close();
  drivers.streams.close();
  drivers.agents.close();
  drivers.slack.close();
}

export function syncAll(drivers: BackgroundDrivers) {
  drivers.streams.sync();
  drivers.agents.sync();
  drivers.slack.sync();
}
export function recoverAll(drivers: BackgroundDrivers) {
  return drivers.agents.recover();
}
