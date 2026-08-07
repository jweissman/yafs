import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitHubCollectionSource } from "../src/plugins/github/GitHubCollectionSource";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";

test("two review sessions share one GitHub revision and leave separate durable traces", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-review-")),
    providers: new ProviderRegistry(
      new GitHubCollectionSource({ pulls: async () => [pull()] }),
    ),
  });
  const alice = await YashClient.connect(server.address());
  const bob = await YashClient.connect(server.address());
  await alice.exec(`printf '${manifest()}' > .yafsmeta`);
  await alice.exec("plugin activate .yafsmeta");
  await alice.exec("mkdir notes");
  await alice.exec("mkdir notes/42");
  await alice.exec("trace reviews/pulls/42 notes/42/alice");
  await bob.exec("trace /home/root/reviews/pulls/42 /home/root/notes/42/bob");
  const aliceTrace = JSON.parse(
    await alice.exec("cat notes/42/alice/trace.json"),
  );
  const bobTrace = JSON.parse(
    await bob.exec("cat /home/root/notes/42/bob/trace.json"),
  );
  expect(aliceTrace.origin.revision).toMatch(/^github:/);
  expect(bobTrace.origin.revision).toBe(aliceTrace.origin.revision);
  await alice.close();
  await bob.close();
  await server.close();
});

test("a due daemon refresh publishes the next complete GitHub snapshot", async () => {
  const pulls = [pull()];
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-refresh-")),
    now: () => Date.now() + 120_000,
    providers: new ProviderRegistry(
      new GitHubCollectionSource({ pulls: async () => pulls }),
    ),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${scheduledManifest()}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  pulls[0] = { ...pull(), diff: "new diff" };
  await server.refreshDue();
  expect(await client.exec("cat reviews/pulls/42/diff.patch")).toBe("new diff");
  await client.close();
  await server.close();
});

function pull() {
  return {
    number: 42,
    title: "Review",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}
function manifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:open", max: 2}, capabilities: [network.github-api]}]}';
}
function scheduledManifest() {
  return manifest().replace(
    "capabilities:",
    "refresh: {interval: 1m}, capabilities:",
  );
}
