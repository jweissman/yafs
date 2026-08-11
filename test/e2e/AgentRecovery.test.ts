import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import {
  fakeMessageModel,
  manifest,
  waitForStatus,
} from "../agent_test_helpers";
import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("restart marks an accepted in-flight run interrupted", async () => {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-agents-recover-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => pendingModel() },
  );
  await client.exec("plugins apply");
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForStatus(
    client,
    "agents/reviewer/runs",
    (status) => status.state === "running",
  );
  await client.close();
  await server.close();
  const restarted = await YafsServer.start({
    dataDir: directory,
    modelFor: () => fakeMessageModel([]),
  });
  const recovered = await YashClient.connect(restarted.address());
  const status = JSON.parse(
    await recovered.exec(`cat agents/reviewer/runs/${runId}/status.json`),
  );
  expect(status.state).toBe("interrupted");
  expect(status.error).toContain("Daemon restarted");
  await recovered.close();
  await restarted.close();
});

test("a malformed persisted agent record is inert during driver recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-agents-invalid-"));
  await writeFile(
    join(directory, "mounts.json"),
    JSON.stringify({ version: 1, mounts: [invalidAgent()] }),
  );
  const server = await YafsServer.start({
    dataDir: directory,
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  expect(await client.exec("echo recovered")).toBe("recovered");
  await client.close();
  await server.close();
});

test("a malformed persisted agent record is visibly quarantined, not silently inert", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-agents-quarantine-"));
  await writeFile(
    join(directory, "mounts.json"),
    JSON.stringify({ version: 1, mounts: [invalidAgent()] }),
  );
  const server = await YafsServer.start({
    dataDir: directory,
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  const status = JSON.parse(await client.exec("plugins status"));
  expect(status.active).toContainEqual({
    id: "agents",
    plugin: "agent",
    path: "/home/root/agents",
    state: "active",
    quarantined: true,
  });
  const events = await audit(directory);
  expect(events.filter((event) => event.action === "quarantine")).toHaveLength(
    1,
  );
  await client.close();
  await server.close();
});

function audit(directory: string) {
  return readFile(join(directory, "audit.ndjson"), "utf8").then((source) =>
    source
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
}

function pendingModel() {
  return { completeChat: () => new Promise<string>(() => undefined) };
}

function invalidAgent() {
  return {
    id: "agents",
    path: "/home/root/agents",
    provider: "agent",
    config: {},
    manifestPath: "/legacy",
    manifestDigest: "legacy",
    revision: "legacy",
    state: "active",
    activatedAt: "2026-01-01T00:00:00.000Z",
    correlationId: "legacy",
    capabilities: [],
    snapshot: { entries: [], fileCount: 0, byteCount: 0 },
  };
}
