import { expect, test } from "bun:test";

import Yafs from "../../../src";
import { GitHubCollectionSource } from "../../../src/plugins/github/GitHubCollectionSource";
import { MountManager } from "../../../src/mounts/MountManager";
import { ProviderRegistry } from "../../../src/mounts/ProviderRegistry";
import { NodeStore } from "../../../src/vfs/NodeStore";
import { parseManifest } from "../../../src/mounts/Manifest";
import { activateDesired, refreshDesired } from "../../desired_mount_helpers";
import { inspectedOrigin } from "../../inspection_helpers";
import { parseJson } from "../../json";

test("a GitHub collection becomes an immutable, attributable review snapshot", async () => {
  const source = new GitHubCollectionSource(fakeClient());
  const yafs = configuredYafs(new ProviderRegistry(source));
  await activateDesired(yafs, githubManifest());
  await refreshDesired(yafs, githubManifest());
  expect(yafs.exec("cat reviews/pulls/42/diff.patch")).toBe(
    "diff --git a/a b/a",
  );
  expect(
    parseJson(yafs.exec("cat reviews/pulls/42/metadata.json")),
  ).toMatchObject({ number: 42 });
  const origin = inspectedOrigin(
    yafs.exec("inspect reviews/pulls/42/diff.patch"),
  );
  expect(origin).toMatchObject({
    provider: "github",
    mountId: "review",
  });
  expect(origin.revision).toMatch(/^github:/);
});

test("a GitHub manifest declares its network capability and rejects unknown configuration", async () => {
  const yafs = configuredYafs(new ProviderRegistry(fakeSource()));
  const ungranted = githubManifest().replace(
    "network.github-api",
    "network.other",
  );
  await expect(activateDesired(yafs, ungranted)).rejects.toThrow(
    "Capabilities are not granted: network.other",
  );
  const unknownField = githubManifest().replace("max: 2", "unknown: 2");
  expect(() => parseManifest(unknownField)).toThrow(
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
  const manifest = githubManifest().replace(
    "[network.github-api]",
    "[network.github-api, secret.github-token]",
  );
  await activateDesired(yafs, manifest);
  expect(yafs.exec("cat reviews/pulls/42/diff.patch")).toBe("private");
});

test("a missing token names the plugin, grant, and daemon setting", async () => {
  const yafs = configuredYafs(new ProviderRegistry(fakeSource()));
  const manifest = githubManifest().replace(
    "[network.github-api]",
    "[network.github-api, secret.github-token]",
  );
  await expect(activateDesired(yafs, manifest)).rejects.toThrow(
    "GitHub plugin 'review' requires secret.github-token, but YAFS_GITHUB_TOKEN",
  );
});

test("a missing public source identifies the configured GitHub plugin", async () => {
  const yafs = configuredYafs(new ProviderRegistry());
  await expect(activateDesired(yafs, githubManifest())).rejects.toThrow(
    "GitHub plugin 'review' has no GitHub source configured.",
  );
});

function configuredYafs(providers: ProviderRegistry) {
  const store = new NodeStore();
  return new Yafs({
    store,
    mounts: new MountManager(store, { providers }),
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
