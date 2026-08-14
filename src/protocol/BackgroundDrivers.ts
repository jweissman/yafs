import { Wiring, PluginDriver } from "../mounts/Plugin";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { AgentPlugin, ModelFor } from "../plugins/agent/AgentPlugin";
import { ToolClientFor } from "../plugins/agent/LmStudioMcpClient";
import { ToolServerUrl } from "../plugins/agent/AgentToolCompletion";
import { AgentToolMcpSync } from "../plugins/agent/AgentToolMcpSync";
import { SlackPlugin, SlackClientFor } from "../plugins/slack/SlackPlugin";
import { SlackInboundPoller } from "../plugins/slack/SlackInboundPoller";
import { ServerRefresh } from "./ServerRefresh";

export type { Wiring, ModelFor, SlackClientFor, ToolClientFor, ToolServerUrl };

export type BackgroundDrivers = {
  refreshes: ServerRefresh;
  plugins: PluginDriver[];
};

export type RefreshTiming = {
  now?: () => number;
  refreshIntervalMs?: number;
  slackPollIntervalMs?: number;
};

function refreshDriver(wiring: Wiring, timing: RefreshTiming) {
  return new ServerRefresh(wiring, {
    now: timing.now,
    intervalMs: timing.refreshIntervalMs,
  });
}

export type Clients = {
  modelFor: ModelFor;
  toolClientFor: ToolClientFor;
  toolServerUrl: ToolServerUrl;
  slackClientFor: SlackClientFor;
  mcpJsonPath?: string;
};

export function backgroundDrivers(
  wiring: Wiring,
  clients: Clients,
  timing: RefreshTiming = {},
): BackgroundDrivers {
  const refreshes = refreshDriver(wiring, timing);
  const plugins = pluginDrivers(wiring, clients, timing);
  return { refreshes, plugins };
}

function pluginDrivers(
  wiring: Wiring,
  clients: Clients,
  timing: RefreshTiming,
) {
  const slack = slackDrivers(wiring, clients.slackClientFor, timing);
  return [...coreDrivers(wiring, clients), ...slack];
}

function coreDrivers(wiring: Wiring, clients: Clients) {
  return [
    new FixturePlugin().createDriver(wiring),
    agentDriver(wiring, clients),
    mcpSyncDriver(wiring, clients),
  ];
}

function agentDriver(wiring: Wiring, clients: Clients) {
  const { modelFor, toolClientFor, toolServerUrl } = clients;
  const agentClients = { modelFor, toolClientFor, toolServerUrl };
  return new AgentPlugin().createDriver(wiring, agentClients);
}

function mcpSyncDriver(wiring: Wiring, clients: Clients) {
  const { toolServerUrl, mcpJsonPath } = clients;
  return new AgentToolMcpSync(wiring.mounts, toolServerUrl, mcpJsonPath);
}

function slackDrivers(
  wiring: Wiring,
  slackClientFor: SlackClientFor,
  timing: RefreshTiming,
) {
  const slack = new SlackPlugin().createDriver(wiring, slackClientFor);
  const inbound = slackInbound(wiring, slackClientFor, timing);
  return [slack, inbound];
}

function slackInbound(
  wiring: Wiring,
  slackClientFor: SlackClientFor,
  timing: RefreshTiming,
) {
  const { mounts, dispatchCtl } = wiring;
  const ms = timing.slackPollIntervalMs;
  return new SlackInboundPoller(mounts, dispatchCtl, slackClientFor, ms);
}
