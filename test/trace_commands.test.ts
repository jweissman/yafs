import { expect, test } from "bun:test";

import Yafs from "../src";
import {
  GitHubCollectionSource,
  GitHubPull,
} from "../src/plugins/github/GitHubCollectionSource";
import { MountManager } from "../src/mounts/MountManager";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { NodeStore } from "../src/vfs/NodeStore";

test("trace captures a provider subtree and reify preserves it after refresh", async () => {
  const pulls: GitHubPull[] = [pull()];
  const yafs = configuredYafs(pulls);
  yafs.store.write("/home/root/.yafsmeta", manifest());
  await yafs.executeAsync("plugin activate .yafsmeta");
  yafs.exec("mkdir notes");
  await yafs.executeAsync("trace reviews/pulls/42 notes/42");
  const trace = JSON.parse(yafs.exec("cat notes/42/trace.json"));
  expect(trace).toMatchObject({
    sourcePath: "/home/root/reviews/pulls/42",
    origin: { provider: "github" },
    resourceReference: {
      kind: "github-pr",
      repository: "acme/widget",
      number: 42,
      headSha: "abc123",
    },
  });
  pulls.length = 0;
  await yafs.executeAsync("plugin refresh .yafsmeta");
  await yafs.executeAsync("reify notes/42 restored");
  expect(yafs.exec("cat restored/diff.patch")).toBe("diff --git");
});

test("trace creates a durable artifact only for a directory and reify rejects existing output", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir notes");
  yafs.exec("echo text > source.txt");
  expect(
    (await yafs.executeAsync("trace source.txt notes/source")).stderr,
  ).toContain("must be a directory");
  await yafs.executeAsync("trace notes notes/copy");
  expect((await yafs.executeAsync("reify notes/copy notes")).stderr).toContain(
    "already exists",
  );
});

test("blobs gc is an explicit control command", async () => {
  const yafs = new Yafs();
  const result = await yafs.executeAsync("blobs gc");
  expect(JSON.parse(result.stdout)).toEqual({ reclaimed: [] });
});

test("a failed trace plan leaves blobs unretained for explicit collection", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir source");
  yafs.exec("echo captured > source/a.txt");
  expect(
    (await yafs.executeAsync("trace source missing/artifact")).error,
  ).toBeDefined();
  expect(
    JSON.parse((await yafs.executeAsync("blobs gc")).stdout).reclaimed,
  ).toHaveLength(1);
});

test("a trace inside command substitution discards its queued retention effect", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir source");
  yafs.exec("echo captured > source/a.txt");
  await yafs.executeAsync("echo $(trace source artifact)");
  expect(yafs.store.get("/home/root/artifact", false)).toBeUndefined();
  expect(
    JSON.parse((await yafs.executeAsync("blobs gc")).stdout).reclaimed,
  ).toHaveLength(1);
});

function configuredYafs(pulls: GitHubPull[]) {
  const store = new NodeStore();
  const source = new GitHubCollectionSource({ pulls: async () => pulls });
  const mounts = new MountManager(
    store,
    undefined,
    undefined,
    undefined,
    new ProviderRegistry(source),
  );
  return new Yafs({ store, mounts });
}

function pull(): GitHubPull {
  return {
    number: 42,
    title: "Improve resolver",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}

function manifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:open", max: 2}, capabilities: [network.github-api]}]}';
}
