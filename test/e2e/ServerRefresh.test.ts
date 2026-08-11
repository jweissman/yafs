import { expect, spyOn, test } from "bun:test";

import { GitHubCollectionSource } from "../../src/plugins/github/GitHubCollectionSource";
import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a failed scheduled refresh does not sever an unrelated client connection", async () => {
  const error = spyOn(console, "error").mockImplementation(() => undefined);
  const { server, client } = await startedHostConfigServer(
    "yafs-refresh-failure-",
    scheduledManifest(),
    {
      now: () => Date.now() + 120_000,
      providers: new ProviderRegistry(
        new GitHubCollectionSource(unreliableClient()),
      ),
    },
  );
  await client.exec("plugins apply");
  await server.refreshDue();
  expect(await client.exec("echo still alive")).toBe("still alive");
  expect(error).toHaveBeenCalled();
  error.mockRestore();
  await client.close();
  await server.close();
});

test("the background refresh timer itself, not just a manually-triggered refresh, picks up due mounts", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-refresh-timer-",
    scheduledManifest(),
    {
      now: () => Date.now() + 120_000,
      refreshIntervalMs: 5,
      providers: new ProviderRegistry(
        new GitHubCollectionSource(countingClient()),
      ),
    },
  );
  await client.exec("plugins apply");
  const initial = await client.exec("cat reviews/pulls/42/metadata.json");
  await waitForChange(client, initial);
  await client.close();
  await server.close();
});

async function waitForChange(client: YashClient, initial: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await client.exec("cat reviews/pulls/42/metadata.json")) !== initial) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Background refresh timer never picked up the updated pull");
}

function unreliableClient() {
  let calls = 0;
  return {
    pulls: async () => {
      calls++;
      if (calls > 1) {
        throw new Error("network unreachable");
      }
      return [pull()];
    },
  };
}
function countingClient() {
  let calls = 0;
  return {
    pulls: async () => {
      calls++;
      return [pull(calls)];
    },
  };
}
function pull(revision = 1) {
  return {
    number: 42,
    title: `Review ${revision}`,
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}
function scheduledManifest() {
  return (
    "{version: 1, mounts: [{id: review, path: reviews, provider: github, " +
    'config: {repository: acme/widget, query: "is:open", max: 2}, refresh: {interval: 1m}, capabilities: [network.github-api]}]}'
  );
}
