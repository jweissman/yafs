import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../../src/plugins/slack/SlackCollectionSource";
import { SlackMessage } from "../../src/plugins/slack/SlackApiClient";
import { fakeMessageModel } from "../agent_model_fakes";
import { startedHostConfigServer } from "../desired_mount_helpers";

export type Reaction = { action: "add" | "remove"; channel: string; ts: string };
export type FakeState = {
  messages: SlackMessage[];
  posted: Array<{ channel: string; text: string }>;
  reactions: Reaction[];
  failNextHistory?: boolean;
};

export function fakeState(messages: SlackMessage[]): FakeState {
  return { messages, posted: [], reactions: [] };
}

export function arrive(state: FakeState, message: SlackMessage) {
  state.messages = [message, ...state.messages];
}

function fakeClient(state: FakeState) {
  return {
    history: async () => historyOrFail(state),
    identity: async () => "BOT",
    postMessage: (channel: string, text: string) => post(state, channel, text),
    ...reactions(state),
  };
}

function reactions(state: FakeState) {
  return {
    addReaction: (channel: string, ts: string) =>
      react(state, "add", channel, ts),
    removeReaction: (channel: string, ts: string) =>
      react(state, "remove", channel, ts),
  };
}

async function post(state: FakeState, channel: string, text: string) {
  state.posted.push({ channel, text });
  return "9.0";
}

async function react(
  state: FakeState,
  action: "add" | "remove",
  channel: string,
  ts: string,
) {
  state.reactions.push({ action, channel, ts });
}

function historyOrFail(state: FakeState) {
  if (state.failNextHistory) {
    state.failNextHistory = false;
    throw new Error("channel_not_found");
  }
  return state.messages;
}

export type ConfigExtra = { requireMention?: boolean; replyTimeoutMs?: number };

export function startServer(
  state: FakeState,
  modelFor: () => ReturnType<typeof fakeMessageModel>,
  configExtra: ConfigExtra = {},
) {
  const client = fakeClient(state);
  const options = serverOptions(client, modelFor);
  return startedHostConfigServer("yafs-slack-inbound-", manifest(configExtra), options);
}

function serverOptions(
  client: ReturnType<typeof fakeClient>,
  modelFor: () => ReturnType<typeof fakeMessageModel>,
) {
  const providers = providersFor(client);
  const slackClientFor = () => client;
  return { providers, slackClientFor, modelFor, slackPollIntervalMs: 20 };
}

function providersFor(client: ReturnType<typeof fakeClient>) {
  return new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(client),
  );
}

export async function waitFor(matches: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (matches()) {
      return;
    }
    await sleep(20);
  }
  throw new Error("Timed out waiting for the condition");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The poller's first tick per mount only establishes a baseline cursor; it
// never routes anything from that tick's fetch window. Tests that inject a
// message right after `plugins apply` must wait past that first tick, or
// their "new" message would be swept into the baseline and never routed.
export function establishedBaseline() {
  return sleep(60);
}

function manifest(extra: ConfigExtra = {}) {
  const agents =
    "{id: reviewer, path: agents, plugin: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a reviewer"}}}, ' +
    "capabilities: [chat.completion]}";
  return `{version: 1, plugins: [${agents}, ${slackPlugin(extra)}]}`;
}

function slackPlugin(extra: ConfigExtra) {
  const fields = requireMentionField(extra) + replyTimeoutField(extra);
  return (
    "{id: updates, path: updates, plugin: slack, " +
    `config: {channel: C123, persona: reviewer${fields}}, ` +
    "capabilities: [network.slack-api, secret.slack-token]}"
  );
}

function requireMentionField(extra: ConfigExtra) {
  return extra.requireMention === undefined
    ? ""
    : `, requireMention: ${extra.requireMention}`;
}

function replyTimeoutField(extra: ConfigExtra) {
  return extra.replyTimeoutMs === undefined
    ? ""
    : `, replyTimeoutMs: ${extra.replyTimeoutMs}`;
}
