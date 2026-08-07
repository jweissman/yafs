import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../src/plugins/slack/SlackCollectionSource";
import { SlackMessage } from "../src/plugins/slack/SlackApiClient";

test("slack send posts a message and the channel snapshot refreshes to include it", async () => {
  const state = fakeState([{ user: "U1", text: "first", ts: "1.0" }]);
  const server = await startServer(state);
  const yash = await YashClient.connect(server.address());
  await yash.exec(`printf '${manifest()}' > .yafsmeta`);
  await yash.exec("plugin activate .yafsmeta");
  expect(await yash.exec("slack send updates second")).toBe(
    "accepted: updates",
  );
  await waitForContent(yash, "updates/messages.ndjson", (content) =>
    content.includes("second"),
  );
  expect(state.posted).toEqual([{ channel: "C123", text: "second" }]);
  await yash.close();
  await server.close();
});

test("a failed post is durably visible instead of silently vanishing", async () => {
  const state = fakeState([]);
  state.fail = true;
  const server = await startServer(state);
  const yash = await YashClient.connect(server.address());
  await yash.exec(`printf '${manifest()}' > .yafsmeta`);
  await yash.exec("plugin activate .yafsmeta");
  await yash.exec("slack send updates hello");
  await waitForContent(yash, "updates/last-error.json", (content) =>
    content.includes("hello"),
  );
  expect(
    JSON.parse(await yash.exec("cat updates/last-error.json")),
  ).toMatchObject({ message: "hello" });
  await yash.close();
  await server.close();
});

test("slack send rejects an unknown plugin id clearly", async () => {
  const server = await startServer(fakeState([]));
  const yash = await YashClient.connect(server.address());
  await expect(yash.exec("slack send nope hi")).rejects.toThrow(
    "No such slack plugin: nope",
  );
  await yash.close();
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
  const dataDir = await mkdtemp(join(tmpdir(), "yafs-slack-"));
  return YafsServer.start({ dataDir, providers, slackClientFor: () => client });
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
    "{version: 1, mounts: [{id: updates, path: updates, provider: slack, config: {channel: C123}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
