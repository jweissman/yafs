import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { GitHubCollectionSource } from "../src/plugins/github/GitHubCollectionSource";
import { MountManager } from "../src/mounts/MountManager";
import { ProviderRegistry } from "../src/mounts/ProviderRegistry";
import { NodeStore } from "../src/vfs/NodeStore";
import { activateDesired } from "./desired_mount_helpers";

test("provider audit links a persisted fetch attempt to its published snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-provider-audit-"));
  const yafs = configuredYafs(
    directory,
    new GitHubCollectionSource({ pulls: async () => [pull()] }),
  );
  await activateDesired(yafs, manifest());
  const events = await audit(directory);
  expect(events.map((event) => event.action)).toEqual(["fetch", "activation"]);
  expect(events.map((event) => event.correlationId)).toEqual([
    events[0].correlationId,
    events[0].correlationId,
  ]);
  expect(events[0]).toMatchObject({
    outcome: "started",
    capabilitiesUsed: ["network.github-api"],
  });
});

test("a failed provider fetch is durable audit state without publishing a mount", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-provider-failure-"));
  const source = new GitHubCollectionSource({
    pulls: async () => {
      throw new Error("unavailable");
    },
  });
  const yafs = configuredYafs(directory, source);
  await expect(activateDesired(yafs, manifest())).rejects.toThrow(
    "unavailable",
  );
  const events = await audit(directory);
  expect(events.map((event) => event.outcome)).toEqual(["started", "failed"]);
  expect(events[1].detail).toBe("unavailable");
  expect(yafs.execute("ls reviews").error?.code).toBe("not_found");
});

function configuredYafs(directory: string, source: GitHubCollectionSource) {
  const store = new NodeStore();
  const manager = new MountManager(
    store,
    join(directory, "mounts.json"),
    join(directory, "audit.ndjson"),
    undefined,
    new ProviderRegistry(source),
  );
  return new Yafs({ store, mounts: manager });
}

function pull() {
  return {
    number: 42,
    title: "Audit",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}
function manifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:open", max: 2}, capabilities: [network.github-api]}]}';
}
function audit(directory: string) {
  return readFile(join(directory, "audit.ndjson"), "utf8").then((source) =>
    source
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
}
