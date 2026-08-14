import { chatCompletionClientFor } from "../plugins/agent/ChatCompletionClient";
import { lmStudioMcpClientFor } from "../plugins/agent/LmStudioClientFactory";
import { AgentToolServer } from "../plugins/agent/AgentToolServer";
import { defaultSlackClient } from "../plugins/slack/SlackApiClient";
import { Clients } from "./BackgroundDrivers";
import { Services, StartOptions } from "./ServerTypes";

export function defaultClients(
  options: StartOptions,
  toolServer: AgentToolServer,
): Clients {
  return { ...agentClients(options, toolServer), ...slackClients(options) };
}

function agentClients(options: StartOptions, toolServer: AgentToolServer) {
  return {
    modelFor: options.modelFor || chatCompletionClientFor,
    toolClientFor: options.toolClientFor || lmStudioMcpClientFor,
    toolServerUrl: urlFor(toolServer),
    mcpJsonPath: options.mcpJsonPath,
  };
}

function slackClients(options: StartOptions) {
  return {
    slackClientFor: options.slackClientFor || (() => defaultSlackClient()),
  };
}

function urlFor(toolServer: AgentToolServer) {
  return (mountId: string, personaName: string) =>
    toolServer.urlFor(mountId, personaName);
}

export function toolServerOptions(services: Services) {
  const { store, mounts, traces, cache, desired } = services;
  return { store, mounts, traces, cache, desired };
}
