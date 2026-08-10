import { expect, test } from "bun:test";

import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../src/plugins/slack/SlackCollectionSource";
import { SlackMessage } from "../src/plugins/slack/SlackApiClient";
import { fakeMessageModel, failingModel } from "./agent_model_fakes";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("a new Slack message is routed to the persona and the reply is posted back", async () => {
  const state = fakeState([{ user: "BOT", text: "prior", ts: "1.0" }]);
  const collected: string[] = [];
  const { server, client } = await startServer(
    state,
    () => fakeMessageModel(collected),
  );
  await client.exec("plugins apply");
  arrive(state, { user: "U1", text: "please review", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(state.posted).toEqual([
    { channel: "C123", text: "reply-to-U1: please review" },
  ]);
  expect(collected).toEqual(["U1: please review"]);
  await client.close();
  await server.close();
});

test("the poller never replies to the bot's own posted messages", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(
    state,
    () => fakeMessageModel([]),
  );
  await client.exec("plugins apply");
  arrive(state, { user: "BOT", text: "self echo", ts: "2.0" });
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

test("a failed agent run is not posted back to Slack", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(
    state,
    () => failingModel("boom"),
  );
  await client.exec("plugins apply");
  arrive(state, { user: "U1", text: "trigger failure", ts: "2.0" });
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

type FakeState = {
  messages: SlackMessage[];
  posted: Array<{ channel: string; text: string }>;
};

function fakeState(messages: SlackMessage[]): FakeState {
  return { messages, posted: [] };
}

function arrive(state: FakeState, message: SlackMessage) {
  state.messages = [message, ...state.messages];
}

function fakeClient(state: FakeState) {
  return {
    history: async () => state.messages,
    identity: async () => "BOT",
    postMessage: async (channel: string, text: string) => {
      state.posted.push({ channel, text });
      return "9.0";
    },
  };
}

async function startServer(
  state: FakeState,
  modelFor: () => ReturnType<typeof fakeMessageModel>,
) {
  const client = fakeClient(state);
  const providers = new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(client),
  );
  return startedHostConfigServer("yafs-slack-inbound-", manifest(), {
    providers,
    slackClientFor: () => client,
    modelFor,
    slackPollIntervalMs: 20,
  });
}

async function waitFor(matches: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (matches()) {
      return;
    }
    await sleep(20);
  }
  throw new Error("Timed out waiting for the condition");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manifest() {
  return (
    "{version: 1, plugins: [" +
    "{id: reviewer, path: agents, plugin: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a reviewer"}}}, ' +
    "capabilities: [chat.completion]}, " +
    "{id: updates, path: updates, plugin: slack, " +
    "config: {channel: C123, persona: reviewer}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
