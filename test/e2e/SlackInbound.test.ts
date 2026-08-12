import { expect, test } from "bun:test";

import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../../src/plugins/slack/SlackCollectionSource";
import { SlackMessage } from "../../src/plugins/slack/SlackApiClient";
import { fakeMessageModel, failingModel } from "../agent_model_fakes";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a message that mentions the bot is routed and the reply is posted back", async () => {
  const state = fakeState([{ user: "BOT", text: "prior", ts: "1.0" }]);
  const collected: string[] = [];
  const { server, client } = await startServer(state, () =>
    fakeMessageModel(collected),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> please review", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(state.posted).toEqual([
    { channel: "C123", text: "reply-to-U1: please review" },
  ]);
  expect(collected).toEqual(["U1: please review"]);
  await client.close();
  await server.close();
});

test("a message that never mentions the bot is left alone, including on a fresh cursor", async () => {
  const state = fakeState([
    { user: "U1", text: "unrelated channel chatter", ts: "1.0" },
    { user: "U2", text: "more chatter, no mention", ts: "2.0" },
  ]);
  const { server, client } = await startServer(state, () =>
    fakeMessageModel([]),
  );
  await client.exec("plugins apply");
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

test("requireMention: false routes a message with no @mention", async () => {
  const state = fakeState([]);
  const collected: string[] = [];
  const { server, client } = await startServer(
    state,
    () => fakeMessageModel(collected),
    { requireMention: false },
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "please review, no mention", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(collected).toEqual(["U1: please review, no mention"]);
  await client.close();
  await server.close();
});

test("the poller never replies to the bot's own posted messages", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(state, () =>
    fakeMessageModel([]),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "BOT", text: "<@BOT> self echo", ts: "2.0" });
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

test("a failed agent run is not posted back to Slack", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(state, () =>
    failingModel("boom"),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> trigger failure", ts: "2.0" });
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
  configExtra: { requireMention?: boolean } = {},
) {
  const client = fakeClient(state);
  const providers = new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(client),
  );
  return startedHostConfigServer("yafs-slack-inbound-", manifest(configExtra), {
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

// The poller's first tick per mount only establishes a baseline cursor; it
// never routes anything from that tick's fetch window. Tests that inject a
// message right after `plugins apply` must wait past that first tick, or
// their "new" message would be swept into the baseline and never routed.
function establishedBaseline() {
  return sleep(60);
}

function manifest(extra: { requireMention?: boolean } = {}) {
  const requireMention =
    extra.requireMention === undefined
      ? ""
      : `, requireMention: ${extra.requireMention}`;
  return (
    "{version: 1, plugins: [" +
    "{id: reviewer, path: agents, plugin: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a reviewer"}}}, ' +
    "capabilities: [chat.completion]}, " +
    "{id: updates, path: updates, plugin: slack, " +
    `config: {channel: C123, persona: reviewer${requireMention}}, ` +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
