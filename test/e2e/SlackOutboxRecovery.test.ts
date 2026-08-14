import { expect, test } from "bun:test";

import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { SlackCollectionSource } from "../../src/plugins/slack/SlackCollectionSource";
import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { waitForStatus } from "../agent_test_helpers";

test("restart marks an accepted in-flight outbound Slack action unknown", async () => {
  const client_ = fakeClient();
  const providers = new ProviderRegistry(
    undefined,
    undefined,
    new SlackCollectionSource(client_),
  );
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-slack-recover-",
    manifest(),
    { providers, slackClientFor: () => client_ },
  );
  await client.exec("plugins apply");
  await client.exec("slack send updates hello");
  const actionId = await waitForStatus(
    client,
    "updates/outbox",
    (status) => status.state === "running",
  );
  await client.close();
  await server.close();

  const restarted = await YafsServer.start({
    dataDir: directory,
    providers,
    slackClientFor: () => client_,
  });
  const recovered = await YashClient.connect(restarted.address());
  const status = JSON.parse(
    await recovered.exec(`cat updates/outbox/${actionId}/status.json`),
  );
  expect(status.state).toBe("unknown");
  expect(status.error).toContain("Daemon restarted");
  await recovered.close();
  await restarted.close();
});

function fakeClient() {
  return {
    history: async () => [],
    identity: async () => "BOT",
    postMessage: () => new Promise<string>(() => undefined),
    addReaction: async () => {},
    removeReaction: async () => {},
  };
}

function manifest() {
  return (
    "{version: 1, plugins: [{id: updates, path: updates, plugin: slack, config: {channel: C123}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
