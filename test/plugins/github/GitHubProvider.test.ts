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

test("a GitHub source with no commits() support publishes only pulls", async () => {
  const yafs = configuredYafs(new ProviderRegistry(fakeSource()));
  await activateDesired(yafs, githubManifest());
  await refreshDesired(yafs, githubManifest());
  expect(yafs.exec("ls reviews")).not.toContain("commits");
});

test("a bounded commit collection publishes alongside pulls", async () => {
  const source = new GitHubCollectionSource(fakeCommitClient());
  const yafs = configuredYafs(new ProviderRegistry(source));
  await activateDesired(yafs, githubManifest());
  await refreshDesired(yafs, githubManifest());
  expect(
    parseJson(yafs.exec("cat reviews/commits/abc123/metadata.json")),
  ).toEqual({
    sha: "abc123",
    author: undefined,
    authorName: undefined,
    message: "Fix the thing",
    date: undefined,
    htmlUrl: "https://github.test/acme/widget/commit/abc123",
    ciStatus: "none",
  });
});

test("commits/HEAD mirrors the newest (first-returned) commit, not just any one", async () => {
  const source = new GitHubCollectionSource(fakeCommitClient());
  const yafs = configuredYafs(new ProviderRegistry(source));
  await activateDesired(yafs, githubManifest());
  await refreshDesired(yafs, githubManifest());
  expect(yafs.exec("cat reviews/commits/HEAD/metadata.json")).toBe(
    yafs.exec("cat reviews/commits/abc123/metadata.json"),
  );
  expect(
    parseJson(yafs.exec("cat reviews/commits/HEAD/metadata.json")),
  ).toMatchObject({ sha: "abc123" });
});

function fakeCommitClient() {
  return {
    pulls: async () => [pull("diff --git a/a b/a")],
    commits: async () => [
      {
        sha: "abc123",
        message: "Fix the thing",
        htmlUrl: "https://github.test/acme/widget/commit/abc123",
        ciStatus: "none" as const,
      },
      {
        sha: "older456",
        message: "An earlier commit",
        htmlUrl: "https://github.test/acme/widget/commit/older456",
        ciStatus: "success" as const,
      },
    ],
  };
}

test("a GitHub manifest declares its network capability and rejects unknown configuration", async () => {
  const yafs = configuredYafs(new ProviderRegistry(fakeSource()));
  const ungranted = githubManifest().replace(
    "network.github-api",
    "network.other",
  );
  await expect(activateDesired(yafs, ungranted)).rejects.toThrow(
    "Capabilities are not granted: network.other",
  );
  const unknownField = githubManifest().replace(
    "repository: acme/widget",
    "repository: acme/widget, unknown: 2",
  );
  expect(() => parseManifest(unknownField)).toThrow(
    "Unknown github config field: unknown (expected one of: repository, " +
      "pulls, commits)",
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

test("a mount with neither pulls nor commits configured never calls the collection source", async () => {
  const yafs = configuredYafs(new ProviderRegistry(throwingSource()));
  const activated = activateDesired(yafs, sourceOnlyManifest());
  await expect(activated).resolves.toBeDefined();
  expect(yafs.exec("ls reviews")).toBe("");
});

function throwingSource() {
  return new GitHubCollectionSource({
    pulls: () => {
      throw new Error("pulls should never be called for a source-only mount");
    },
  });
}

function sourceOnlyManifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget}, capabilities: [network.github-api]}]}';
}

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
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, pulls: {query: "is:pr is:open", max: 2}}, capabilities: [network.github-api]}]}';
}
