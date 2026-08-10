import { expect, test } from "bun:test";

import Yafs from "../src";
import {
  SlackCollectionSource,
  SlackClient,
} from "../src/plugins/slack/SlackCollectionSource";
import { MountManager } from "../src/mounts/MountManager";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { NodeStore } from "../src/vfs/NodeStore";
import { parseManifest } from "../src/mounts/Manifest";
import { activateDesired } from "./desired_mount_helpers";

test("a Slack channel becomes an ordered, immutable message snapshot", async () => {
  const yafs = configuredYafs(
    new ProviderRegistry(
      undefined,
      undefined,
      new SlackCollectionSource(fakeClient()),
    ),
  );
  await activateDesired(yafs, slackManifest());
  assertMessagesPublished(yafs);
  assertPluginDescribed(yafs);
});

function assertMessagesPublished(yafs: Yafs) {
  const lines = yafs
    .exec("cat updates/messages.ndjson")
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines).toEqual([
    { user: "U1", text: "first", ts: "1.0" },
    { user: "U2", text: "second", ts: "2.0" },
  ]);
  expect(
    JSON.parse(yafs.exec("inspect updates/messages.ndjson")).origins[0],
  ).toMatchObject({
    provider: "slack",
    mountId: "updates",
    revision: expect.stringMatching(/^slack:/),
  });
}

function assertPluginDescribed(yafs: Yafs) {
  expect(JSON.parse(yafs.exec("plugins describe slack"))).toMatchObject([
    {
      name: "slack",
      actions: [
        {
          name: "send",
          capability: "network.slack-api",
          pseudobinary: "slack send PLUGIN_ID MESSAGE",
        },
      ],
    },
  ]);
}

test("a Slack manifest requires both capabilities and rejects unknown configuration", async () => {
  const yafs = configuredYafs(
    new ProviderRegistry(
      undefined,
      undefined,
      new SlackCollectionSource(fakeClient()),
    ),
  );
  const ungranted = slackManifest().replace(
    "secret.slack-token",
    "secret.other",
  );
  await expect(activateDesired(yafs, ungranted)).rejects.toThrow(
    "Capabilities are not granted: secret.other",
  );
  assertRejectsInvalidConfig();
});

function assertRejectsInvalidConfig() {
  expect(() =>
    parseManifest(slackManifest().replace("max: 10", "unknown: 10")),
  ).toThrow(
    "Unknown slack config field: unknown (expected one of: channel, max)",
  );
  expect(() => parseManifest(slackManifest().replace("C123", "a/b"))).toThrow(
    "Invalid slack channel",
  );
  expect(() =>
    parseManifest(slackManifest().replace("max: 10", "max: 0")),
  ).toThrow("Invalid slack max");
}

test("an unconfigured Slack provider fails clearly instead of silently publishing nothing", async () => {
  const yafs = configuredYafs(new ProviderRegistry());
  await expect(activateDesired(yafs, slackManifest())).rejects.toThrow(
    "Slack provider is not configured",
  );
});

function configuredYafs(providers: ProviderRegistry) {
  const store = new NodeStore();
  return new Yafs({
    store,
    mounts: new MountManager(store, undefined, undefined, undefined, providers),
  });
}

function fakeClient(): SlackClient {
  return {
    history: async () => [
      { user: "U2", text: "second", ts: "2.0" },
      { user: "U1", text: "first", ts: "1.0" },
    ],
  };
}

function slackManifest() {
  return (
    "{version: 1, mounts: [{id: updates, path: updates, provider: slack, config: {channel: C123, max: 10}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}"
  );
}
