import { expect, test } from "bun:test";
import { mkdtemp, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import { GitHubCollectionSource } from "../src/plugins/github/GitHubCollectionSource";
import { GitHubTraceReifier } from "../src/plugins/github/GitHubTraceReifier";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("a durable trace survives restart, retains its blobs, and reifies without its source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-trace-recovery-"));
  const server = await YafsServer.start({ dataDir: directory });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir source");
  await client.exec("echo captured > source/a.txt");
  await client.exec("mkdir artifacts");
  await client.exec("trace source artifacts/one");
  await client.close();
  await server.close();
  const restarted = await YafsServer.start({ dataDir: directory });
  const restored = await YashClient.connect(restarted.address());
  expect(await restored.exec("blobs gc")).toBe('{"reclaimed":[]}');
  await restored.exec("reify artifacts/one restored");
  expect(await restored.exec("cat restored/a.txt")).toBe("captured");
  await restored.close();
  await restarted.close();
});

test("a daemon reifies a missing pinned GitHub trace only through its provider hook", async () => {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-provider-reify-",
    manifest(),
    { providers: providers() },
  );
  await client.exec("plugins apply");
  await client.exec("mkdir artifacts");
  await client.exec("trace reviews/pulls/42 artifacts/one");
  const trace = JSON.parse(await client.exec("cat artifacts/one/trace.json"));
  await client.close();
  await server.close();
  await unlink(blobPath(directory, trace.entries[0].digest));
  const restarted = await YafsServer.start({
    dataDir: directory,
    traceReifier: reifier(),
  });
  const restored = await YashClient.connect(restarted.address());
  await restored.exec("reify artifacts/one restored");
  expect(await restored.exec("cat restored/diff.patch")).toBe("diff --git");
  await restored.close();
  await restarted.close();
});

test("a daemon reifies a missing pinned GitHub trace by refetching the pull through the real GitHub reifier", async () => {
  const { directory, trace } = await capturedGitHubTrace();
  await removeBlobs(directory, trace);
  const reifier = new GitHubTraceReifier({ pull: async () => pull() });
  const restarted = await YafsServer.start({
    dataDir: directory,
    traceReifier: reifier,
  });
  const restored = await YashClient.connect(restarted.address());
  await restored.exec("reify artifacts/one restored");
  expect(await restored.exec("cat restored/diff.patch")).toBe("diff --git");
  expect(
    JSON.parse(await restored.exec("cat restored/metadata.json")),
  ).toMatchObject({
    number: 42,
    headSha: "abc123",
  });
  await restored.close();
  await restarted.close();
});

async function capturedGitHubTrace() {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-github-reify-src-",
    manifest(),
    { providers: providers() },
  );
  await client.exec("plugins apply");
  await client.exec("mkdir artifacts");
  await client.exec("trace reviews/pulls/42 artifacts/one");
  const trace = JSON.parse(await client.exec("cat artifacts/one/trace.json"));
  await client.close();
  await server.close();
  return { directory, trace };
}

async function removeBlobs(
  directory: string,
  trace: { entries: { digest: string }[] },
) {
  for (const digest of new Set(trace.entries.map((item) => item.digest))) {
    await unlink(blobPath(directory, digest));
  }
}

function providers() {
  return new ProviderRegistry(
    new GitHubCollectionSource({ pulls: async () => [pull()] }),
  );
}
function pull() {
  return {
    number: 42,
    title: "Trace me",
    updatedAt: "2026-08-04T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}
function manifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:open", max: 1}, capabilities: [network.github-api]}]}';
}
function blobPath(directory: string, digest: string) {
  return join(directory, "blobs", digest.slice(0, 2), digest);
}
function recovered(trace: { resourceReference?: object }) {
  expect(trace.resourceReference).toMatchObject({
    kind: "github-pr",
    number: 42,
    headSha: "abc123",
  });
  return new TextEncoder().encode("diff --git");
}
function reifier() {
  return {
    reify: async (trace: { resourceReference?: object }) => recovered(trace),
  };
}
