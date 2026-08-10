import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { MountManager } from "../src/mounts/MountManager";
import { NodeStore } from "../src/vfs/NodeStore";
import { agentTarget } from "../src/plugins/agent/AgentTarget";
import { agentPersonaPath } from "../src/plugins/agent/AgentPersonaLookup";
import { manifest } from "./agent_test_helpers";
import { activateDesired } from "./desired_mount_helpers";

test("agentTarget rejects an unknown persona and a malformed persisted config", async () => {
  const mounts = await malformedMounts();
  expect(() => agentTarget(mounts, "agents", "reviewer")).toThrow(
    "Invalid persisted agent configuration: agents",
  );
});

test("a path-form persona reference that resolves to no mount is rejected", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, manifest({ reviewer: "prompt" }));
  expect(() => agentPersonaPath(yafs.mounts, "agents/nope")).toThrow(
    "No such persona: agents/nope",
  );
  expect(() => agentTarget(yafs.mounts, "reviewer", "nope")).toThrow(
    "No such persona: nope",
  );
});

async function malformedMounts() {
  const directory = await mkdtemp(join(tmpdir(), "yafs-agent-target-"));
  const statePath = join(directory, "mounts.json");
  await writeFile(
    statePath,
    JSON.stringify({ version: 1, mounts: [invalidAgent()] }),
  );
  return new MountManager(new NodeStore(), statePath);
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
    capabilities: ["chat.completion"],
    snapshot: { entries: [], fileCount: 0, byteCount: 0 },
  };
}
