import { expect, test } from "bun:test";

import { YashClient } from "../src/protocol/client";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../src/plugins/slack/SlackCollectionSource";
import { SlackMessage } from "../src/plugins/slack/SlackApiClient";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("slack send posts a message and the channel snapshot refreshes to include it", async () => {
  const state = fakeState([{ user: "U1", text: "first", ts: "1.0" }]);
  const { server, client } = await startServer(state);
  await client.exec("plugins apply");
  expect(await client.exec("slack send updates second")).toBe(
    "accepted: updates",
  );
  await waitForContent(client, "updates/messages.ndjson", (content) =>
    content.includes("second"),
  );
  expect(state.posted).toEqual([{ channel: "C123", text: "second" }]);
  await client.close();
  await server.close();
});

test("a failed post is durably visible instead of silently vanishing", async () => {
  const state = fakeState([]);
  state.fail = true;
  const { server, client } = await startServer(state);
  await client.exec("plugins apply");
  await client.exec("slack send updates hello");
  await waitForContent(client, "updates/last-error.json", (content) =>
    content.includes("hello"),
  );
  expect(
    JSON.parse(await client.exec("cat updates/last-error.json")),
  ).toMatchObject({ message: "hello" });
  await client.close();
  await server.close();
});

test("slack send rejects an unknown plugin id clearly", async () => {
  const { server, client } = await startServer(fakeState([]));
  await expect(client.exec("slack send nope hi")).rejects.toThrow(
    "No such slack plugin: nope",
  );
  await client.close();
  await server.close();
});

type FakeState = {
  messages: SlackMessage[];
  posted: Array<{ channel: string; text: string }>;
  fail: boolean;
};

function fakeState(messages: SlackMessage[]): FakeState {
  return { messages, posted: [], fail: false };
}

function fakeClient(state: FakeState) {
  return {
    history: async () => state.messages,
    postMessage: (channel: string, text: string) => post(state, channel, text),
  };
}

async function post(state: FakeState, channel: string, text: string) {
  if (state.fail) {
    throw new Error("channel_not_found");
  }
  state.posted.push({ channel, text });
  state.messages = [{ user: "BOT", text, ts: "9.0" }, ...state.messages];
  return "9.0";
}

async function startServer(state: FakeState) {
  const client = fakeClient(state);
  const providers = new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(client),
  );
  return startedHostConfigServer("yafs-slack-", manifest(), {
    providers,
    slackClientFor: () => client,
  });
}

async function waitForContent(
  client: YashClient,
  path: string,
  matches: (content: string) => boolean,
  timeoutMs = 3000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await client.exec(`cat ${path}`).catch(() => "");
    if (matches(content)) {
      return content;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${path} to match`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manifest() {
  return (
    "{version: 1, plugins: [{id: updates, path: updates, plugin: slack, config: {channel: C123}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
