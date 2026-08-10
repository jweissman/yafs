import { Wiring, PluginDriver } from "../mounts/Plugin";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { AgentPlugin, ModelFor } from "../plugins/agent/AgentPlugin";
import { SlackPlugin, SlackClientFor } from "../plugins/slack/SlackPlugin";
import { ServerRefresh } from "./ServerRefresh";

export type { Wiring, ModelFor, SlackClientFor };

export type BackgroundDrivers = {
  refreshes: ServerRefresh;
  plugins: PluginDriver[];
};

export type RefreshTiming = { now?: () => number; refreshIntervalMs?: number };

function refreshDriver(wiring: Wiring, timing: RefreshTiming) {
  const { mounts, journal, enqueue } = wiring;
  const { now, refreshIntervalMs } = timing;
  return new ServerRefresh(mounts, journal, enqueue, now, refreshIntervalMs);
}

export function backgroundDrivers(
  wiring: Wiring,
  modelFor: ModelFor,
  slackClientFor: SlackClientFor,
  timing: RefreshTiming = {},
): BackgroundDrivers {
  const refreshes = refreshDriver(wiring, timing);
  const plugins = pluginDrivers(wiring, modelFor, slackClientFor);
  return { refreshes, plugins };
}

function pluginDrivers(
  wiring: Wiring,
  modelFor: ModelFor,
  slackClientFor: SlackClientFor,
) {
  const fixture = new FixturePlugin().createDriver(wiring);
  const agent = new AgentPlugin().createDriver(wiring, modelFor);
  const slack = new SlackPlugin().createDriver(wiring, slackClientFor);
  return [fixture, agent, slack];
}

export function startAll(drivers: BackgroundDrivers) {
  drivers.refreshes.start();
  drivers.plugins.forEach((plugin) =>
    plugin.start ? plugin.start() : plugin.sync(),
  );
}

export function closeAll(drivers: BackgroundDrivers) {
  drivers.refreshes.close();
  drivers.plugins.forEach((plugin) => plugin.close());
}

export function syncAll(drivers: BackgroundDrivers) {
  drivers.plugins.forEach((plugin) => plugin.sync());
}

export function recoverAll(drivers: BackgroundDrivers) {
  return Promise.all(
    drivers.plugins
      .filter((plugin) => plugin.recover)
      .map((plugin) => plugin.recover!()),
  );
}
