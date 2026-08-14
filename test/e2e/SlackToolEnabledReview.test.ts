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

// Proves the pieces built this phase actually chain together: a Slack
// inbound message routes to a tool-enabled persona, that persona drives its
// own bounded MCP tool-call loop (M6.5) against live mount data instead of
// just answering from the prompt, and the reply that goes back to Slack is
// the model's final message. `tools.json` is the durable evidence a tool
// call really happened, not just that a reply was posted.
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
    { channel: "C123", text: "Looks fine, no open PRs need review." },
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
  return JSON.parse(raw);
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
