import { expect, test } from "bun:test";

import Yafs from "../src";
import { GitHubCollectionSource } from "../src/mounts/GitHubCollectionSource";
import { MountManager } from "../src/mounts/MountManager";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { NodeStore } from "../src/vfs/NodeStore";

test("a GitHub collection becomes an immutable, attributable review snapshot", async () => {
  const source = new GitHubCollectionSource(fakeClient());
  const yafs = configuredYafs(new ProviderRegistry(source));
  yafs.store.write("/home/root/.yafsmeta", githubManifest());
  const result = await yafs.executeAsync("mount activate .yafsmeta");
  expect(result.stdout).toBe("review active");
  expect((await yafs.executeAsync("mount refresh .yafsmeta")).stdout).toBe(
    "review refreshed",
  );
  expect(yafs.exec("cat reviews/pulls/42/diff.patch")).toBe(
    "diff --git a/a b/a",
  );
  expect(
    JSON.parse(yafs.exec("cat reviews/pulls/42/metadata.json")),
  ).toMatchObject({ number: 42 });
  expect(
    JSON.parse(yafs.exec("inspect reviews/pulls/42/diff.patch")).origins[0],
  ).toMatchObject({
    provider: "github",
    mountId: "review",
    revision: expect.stringMatching(/^github:/),
  });
});

test("a GitHub manifest declares its network capability and rejects unknown configuration", () => {
  const yafs = configuredYafs(new ProviderRegistry(fakeSource()));
  yafs.store.write(
    "/home/root/.yafsmeta",
    githubManifest().replace("network.github-api", "network.other"),
  );
  expect(yafs.execute("mount activate .yafsmeta").stderr).toBe(
    "Capabilities are not granted: network.other",
  );
  yafs.store.write(
    "/home/root/.yafsmeta",
    githubManifest().replace("max: 2", "unknown: 2"),
  );
  expect(yafs.execute("mount validate .yafsmeta").stderr).toBe(
    "Unknown github config field: unknown (expected one of: repository, query, max)",
  );
});

test("a declared secret grant selects an authenticated provider source", async () => {
  const publicSource = new GitHubCollectionSource({
    pulls: async () => [pull("public")],
  });
  const privateSource = new GitHubCollectionSource({
    pulls: async () => [pull("private")],
  });
  const yafs = configuredYafs(
    new ProviderRegistry(publicSource, privateSource),
  );
  yafs.store.write(
    "/home/root/.yafsmeta",
    githubManifest().replace(
      "[network.github-api]",
      "[network.github-api, secret.github-token]",
    ),
  );
  await yafs.executeAsync("mount activate .yafsmeta");
  expect(yafs.exec("cat reviews/pulls/42/diff.patch")).toBe("private");
});

function configuredYafs(providers: ProviderRegistry) {
  const store = new NodeStore();
  return new Yafs({
    store,
    mounts: new MountManager(store, undefined, undefined, undefined, providers),
  });
}

function fakeSource() {
  return new GitHubCollectionSource(fakeClient());
}

function fakeClient() {
  return { pulls: async () => [pull("diff --git a/a b/a")] };
}

function pull(diff: string) {
  return {
    number: 42,
    title: "Improve resolver",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff,
  };
}

function githubManifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:pr is:open", max: 2}, capabilities: [network.github-api]}]}';
}
