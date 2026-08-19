import { expect, test } from "bun:test";

import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../../src/plugins/slack/SlackCollectionSource";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { YashClient } from "../../src/protocol/client";
import {
  LmStudioTurn,
  LmStudioTurnRequest,
  ToolClient,
} from "../../src/plugins/agent/LmStudioMcpClient";
import {
  arrive,
  establishedBaseline,
  fakeState,
  waitFor,
} from "./slack_inbound_helpers";
import { fakeClient, FakeState } from "./slack_inbound_fakes";
import { parseJson } from "../json";

test("a Slack message routed to a tool-enabled persona drives a real tool call before replying", async () => {
  const state = fakeState([]);
  const calls: LmStudioTurnRequest[] = [];
  const toolClient = fakeToolClient(calls, [
    turn("Looks fine, no open PRs need review."),
  ]);
  const { server, client } = await startedHostConfigServer(
    "yafs-slack-tools-",
    manifest(),
    serverOptions(state, toolClient),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> what needs review?", ts: "2.0" });

  await waitFor(() => state.posted.length > 0);

  expect(state.posted).toEqual([
    {
      channel: "C123",
      text: "Looks fine, no open PRs need review.\n\n---\n1 tool call(s) this turn, in 0s.",
    },
  ]);
  expect(calls).toHaveLength(1);
  const transcript = await toolsTranscript(client);
  expect(transcript).toContainEqual(
    expect.objectContaining({ type: "tool_call", tool: "yafs.read" }),
  );

  await client.close();
  await server.close();
});

async function toolsTranscript(client: YashClient) {
  const runId = (await client.exec("ls agents/reviewer/runs")).trim();
  const raw = await client.exec(`cat agents/reviewer/runs/${runId}/tools.json`);
  const value = parseJson(raw);
  if (!Array.isArray(value)) {
    throw new Error("Expected a tool transcript");
  }
  return value.map((item) => item as unknown);
}

function serverOptions(state: FakeState, toolClient: ToolClient) {
  const slack = fakeClient(state);
  const providers = new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(slack),
  );
  return {
    providers,
    slackClientFor: () => slack,
    toolClientFor: () => toolClient,
    slackPollIntervalMs: 20,
  };
}

function turn(message: string): LmStudioTurn {
  return {
    output: [
      { type: "tool_call", tool: "yafs.read", arguments: {}, output: "..." },
      { type: "message", content: message },
    ],
    responseId: "resp_1",
  };
}

function fakeToolClient(
  calls: LmStudioTurnRequest[],
  turns: LmStudioTurn[],
): ToolClient {
  return {
    respond: async (request) => {
      calls.push(request);
      return turns[calls.length - 1];
    },
  };
}

function manifest() {
  const agent =
    "{id: agents, path: agents, plugin: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a terse reviewer.", ' +
    'tools: {roots: ["/home/root/agents"]}}}}, capabilities: [chat.completion]}';
  const slack =
    "{id: updates, path: updates, plugin: slack, " +
    "config: {channel: C123, persona: reviewer}, " +
    "capabilities: [network.slack-api, secret.slack-token]}";
  return `{version: 1, plugins: [${agent}, ${slack}]}`;
}
