import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MountManager } from "../../../src/mounts/MountManager";
import { NodeStore } from "../../../src/vfs/NodeStore";
import { recoverSlackOutbox } from "../../../src/plugins/slack/SlackOutboxRecovery";
import { succeededStatus } from "../../../src/plugins/slack/SlackOutboxStatus";

test("recovery leaves an already-succeeded outbox action alone", async () => {
  const mounts = await mountsWithOutboxStatus(succeededStatus("2026-01-01"));
  const written: unknown[] = [];
  const store = {
    writeStatus: async (id: unknown, status: unknown) => {
      written.push({ id, status });
    },
  } as Parameters<typeof recoverSlackOutbox>[1];
  await recoverSlackOutbox(mounts, store);
  expect(written).toEqual([]);
});

async function mountsWithOutboxStatus(status: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "yafs-slack-outbox-"));
  const statePath = join(directory, "mounts.json");
  await writeFile(
    statePath,
    JSON.stringify({ version: 1, mounts: [slackMount(status)] }),
  );
  return new MountManager(new NodeStore(), { statePath });
}

function slackMount(status: unknown) {
  return {
    id: "updates",
    path: "/home/root/updates",
    provider: "slack",
    config: { channel: "C123" },
    manifestPath: "/legacy",
    manifestDigest: "legacy",
    revision: "legacy",
    state: "active",
    activatedAt: "2026-01-01T00:00:00.000Z",
    correlationId: "legacy",
    capabilities: [],
    snapshot: {
      entries: [["outbox/action-1/status.json", JSON.stringify(status)]],
      fileCount: 1,
      byteCount: 0,
    },
  };
}
