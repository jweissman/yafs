import { expect, test } from "bun:test";

import Yafs from "../../src";
import {
  GitHubCollectionSource,
  GitHubPull,
} from "../../src/plugins/github/GitHubCollectionSource";
import { MountManager } from "../../src/mounts/MountManager";
import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { NodeStore } from "../../src/vfs/NodeStore";
import { activateDesired, refreshDesired } from "../desired_mount_helpers";
import { parseJson } from "../json";

test("capture preserves a provider subtree across refresh and restore", async () => {
  const pulls: GitHubPull[] = [pull()];
  const yafs = configuredYafs(pulls);
  await activateDesired(yafs, manifest());
  yafs.exec("mkdir notes");
  await yafs.executeAsync("capture reviews/pulls/42 notes/42");
  const trace = parseJson(yafs.exec("cat notes/42/trace.json"));
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
  await refreshDesired(yafs, manifest());
  await yafs.executeAsync("restore notes/42 restored");
  expect(yafs.exec("cat restored/diff.patch")).toBe("diff --git");
});

test("capture only accepts directories and restore rejects existing output", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir notes");
  yafs.exec("echo text > source.txt");
  expect(
    (await yafs.executeAsync("capture source.txt notes/source")).stderr,
  ).toContain("must be a directory");
  await yafs.executeAsync("capture notes notes/copy");
  expect(
    (await yafs.executeAsync("restore notes/copy notes")).stderr,
  ).toContain("already exists");
  expect(
    (await yafs.executeAsync("capture --limit 0 notes notes/limited")).stderr,
  ).toContain("Result limit exceeded");
  expect(
    (await yafs.executeAsync("capture notes notes/copy")).stderr,
  ).toContain("Capture destination already exists");
});

test("blobs gc is an explicit control command", async () => {
  const yafs = new Yafs();
  const result = await yafs.executeAsync("blobs gc");
  expect(JSON.parse(result.stdout)).toEqual({ reclaimed: [] });
});

test("blobs rejects any subcommand other than gc", async () => {
  const yafs = new Yafs();
  expect((await yafs.executeAsync("blobs")).stderr).toBe("blobs requires gc");
});

test("capture --limit rejects a non-numeric count", async () => {
  const yafs = new Yafs();
  await yafs.executeAsync("mkdir notes");
  expect(
    (await yafs.executeAsync("capture --limit abc notes notes/copy")).stderr,
  ).toBe("capture requires --limit COUNT");
});

test("a failed trace plan leaves blobs unretained for explicit collection", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir source");
  yafs.exec("echo captured > source/a.txt");
  expect(
    (await yafs.executeAsync("capture source missing/artifact")).error,
  ).toBeDefined();
  expect(reclaimed((await yafs.executeAsync("blobs gc")).stdout)).toHaveLength(
    1,
  );
});

test("command substitution rejects trace before it can retain blobs", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir source");
  yafs.exec("echo captured > source/a.txt");
  expect(
    (await yafs.executeAsync("echo $(trace source artifact)")).stderr,
  ).toContain("not read-only");
  expect(yafs.store.get("/home/root/artifact", false)).toBeUndefined();
  expect(reclaimed((await yafs.executeAsync("blobs gc")).stdout)).toHaveLength(
    0,
  );
});

function configuredYafs(pulls: GitHubPull[]) {
  const store = new NodeStore();
  const source = new GitHubCollectionSource({ pulls: async () => pulls });
  const mounts = new MountManager(store, {
    providers: new ProviderRegistry(source),
  });
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

function reclaimed(source: string): unknown[] {
  const value = parseJson(source);
  if (!isRecord(value) || !Array.isArray(value.reclaimed)) {
    throw new Error("Expected a blob collection response");
  }
  return value.reclaimed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
