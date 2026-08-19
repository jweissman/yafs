import { expect, test } from "bun:test";

import { sleep } from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { YashClient } from "../../src/protocol/client";

test("a tool-enabled persona with no resolvable model fails clearly, before any request goes out", async () => {
  const originalEnv = process.env.YAFS_LMSTUDIO_MODEL;
  delete process.env.YAFS_LMSTUDIO_MODEL;
  const { server, client: yash } = await startedHostConfigServer(
    "yafs-agent-tools-nomodel-",
    manifest(),
    {},
  );
  try {
    await yash.exec("plugins apply");
    await send(yash, "run-1", "hi", "c1");
    await waitForFailed(yash, "run-1");
    const status = await statusOf(yash, "run-1");
    expect(status?.error).toContain("No model resolved");
  } finally {
    restoreEnv(originalEnv);
    await yash.close();
    await server.close();
  }
});

function restoreEnv(value: string | undefined) {
  if (value === undefined) {
    delete process.env.YAFS_LMSTUDIO_MODEL;
  } else {
    process.env.YAFS_LMSTUDIO_MODEL = value;
  }
}

function send(
  client: YashClient,
  runId: string,
  message: string,
  chatId: string,
) {
  const payload = JSON.stringify({ message, chatId, runId });
  return client.exec(`printf '${payload}' > agents/reviewer/ctl`);
}

async function waitForFailed(
  client: YashClient,
  runId: string,
  timeoutMs = 3000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await statusOf(client, runId);
    if (current?.state === "failed") {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for run ${runId} to fail`);
}

async function statusOf(client: YashClient, runId: string) {
  const raw = await client
    .exec(`cat agents/reviewer/runs/${runId}/status.json`)
    .catch(() => undefined);
  return raw
    ? (JSON.parse(raw) as { state: string; error?: string })
    : undefined;
}

function manifest() {
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a terse reviewer.", ' +
    'endpoint: "http://fake.test/api/v1", tools: {roots: ' +
    '["/home/root/agents"]}}}}, capabilities: [chat.completion]}]}'
  );
}
