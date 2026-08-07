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

function refreshDriver(
  wiring: Wiring,
  now?: () => number,
  refreshIntervalMs?: number,
) {
  const { mounts, journal, enqueue } = wiring;
  return new ServerRefresh(mounts, journal, enqueue, now, refreshIntervalMs);
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
    plugins: pluginDrivers(wiring, modelFor, slackClientFor),
  };
}

function pluginDrivers(
  wiring: Wiring,
  modelFor: ModelFor,
  slackClientFor: SlackClientFor,
) {
  return [
    new FixturePlugin().createDriver(wiring),
    new AgentPlugin().createDriver(wiring, modelFor),
    new SlackPlugin().createDriver(wiring, slackClientFor),
  ];
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
