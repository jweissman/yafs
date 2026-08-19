import { Plugin, Wiring, PluginDriver } from "../mounts/Plugin";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import {
  AgentPlugin,
  AgentDriverConfig,
  ModelFor,
} from "../plugins/agent/AgentPlugin";
import { ToolClientFor } from "../plugins/agent/LmStudioMcpClient";
import { ToolServerUrl } from "../plugins/agent/AgentToolCompletion";
import { SlackPlugin, SlackClientFor } from "../plugins/slack/SlackPlugin";
import { GitHubPlugin } from "../plugins/github/GitHubPlugin";
import { SchedulerPlugin } from "../plugins/scheduler/SchedulerPlugin";
import { ServerRefresh } from "./ServerRefresh";
import type Yafs from "../index";

export type { Wiring, ModelFor, SlackClientFor, ToolClientFor, ToolServerUrl };

export interface BackgroundDrivers {
  refreshes: ServerRefresh;
  plugins: PluginDriver[];
}

export interface RefreshTiming {
  now?: () => number;
  refreshIntervalMs?: number;
  slackPollIntervalMs?: number;
}

export interface Clients {
  modelFor: ModelFor;
  toolClientFor: ToolClientFor;
  toolServerUrl: ToolServerUrl;
  slackClientFor: SlackClientFor;
  mcpJsonPath?: string;

  scheduledYafs?: Yafs;
}

export function backgroundDrivers(
  wiring: Wiring,
  clients: Clients,
  timing: RefreshTiming = {},
): BackgroundDrivers {
  return {
    refreshes: refreshDriver(wiring, timing),
    plugins: pluginDrivers(wiring, clients, timing),
  };
}

function refreshDriver(wiring: Wiring, timing: RefreshTiming) {
  return new ServerRefresh(wiring, {
    now: timing.now,
    intervalMs: timing.refreshIntervalMs,
  });
}

function pluginDrivers(
  wiring: Wiring,
  clients: Clients,
  timing: RefreshTiming,
): PluginDriver[] {
  return configuredPlugins(clients, timing).flatMap((plugin) =>
    plugin.createDriver(wiring),
  );
}

function configuredPlugins(clients: Clients, timing: RefreshTiming): Plugin[] {
  return [
    new FixturePlugin(),
    new AgentPlugin(agentDriverConfig(clients)),
    new SlackPlugin(undefined, slackDriverConfig(clients, timing)),
    new GitHubPlugin(),
    new SchedulerPlugin(schedulerDriverConfig(clients)),
  ];
}

function schedulerDriverConfig(clients: Clients) {
  return clients.scheduledYafs ? { yafs: clients.scheduledYafs } : undefined;
}

function agentDriverConfig(clients: Clients): AgentDriverConfig {
  const { modelFor, toolClientFor, toolServerUrl, mcpJsonPath } = clients;
  return { modelFor, toolClientFor, toolServerUrl, mcpJsonPath };
}

function slackDriverConfig(clients: Clients, timing: RefreshTiming) {
  return {
    clientFor: clients.slackClientFor,
    pollIntervalMs: timing.slackPollIntervalMs,
  };
}
