import { writeFile } from "node:fs/promises";

import { expect, test } from "bun:test";

import { sleep } from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { YashClient } from "../../src/protocol/client";
import {
  LmStudioTurnRequest,
  ToolClient,
} from "../../src/plugins/agent/LmStudioMcpClient";
import { yafsKey } from "../../src/plugins/agent/LmStudioMcpJson";
import { parseJson } from "../json";

// AgentTools.test.ts only covers a persona that has `tools:` from its very
// first activation. This covers the case the user actually hit live: a
// persona already active WITHOUT tools, then `tools:` added to the manifest
// and `plugins apply` run again — does the refresh actually pick it up and
// start attaching the plugin integration?
test("adding tools: to an already-active persona and re-applying enables MCP on the next request", async () => {
  const calls: LmStudioTurnRequest[] = [];
  const client = fakeToolClient(calls);
  const {
    server,
    client: yash,
    configPath,
  } = await startedHostConfigServer(
    "yafs-agent-tools-refresh-",
    manifestWithoutTools(),
    { toolClientFor: () => client },
  );

  // YafsServer.start() already reconciles the config at boot (server.ts's
  // `await s.reconcile()`), so the mount is already active by the time a
  // client connects — this first apply is expected to report no changes.
  const applyWithoutTools = parseJson(await yash.exec("plugins apply"));
  expect(applyWithoutTools).toEqual([]);

  await writeFile(configPath, manifestWithTools());
  const applyWithTools = parseJson(await yash.exec("plugins apply"));
  expect(applyWithTools).toEqual([{ id: "agents", action: "refresh" }]);

  await send(yash, "run-1", "hi", "c1");
  await waitForComplete(yash, "run-1");
  expect(calls).toHaveLength(1);
  expect(calls[0].integrations).toEqual([
    { type: "plugin", id: `mcp/${yafsKey("agents", "reviewer")}` },
  ]);

  await yash.close();
  await server.close();
});

function send(
  client: YashClient,
  runId: string,
  message: string,
  chatId: string,
) {
  const payload = JSON.stringify({ message, chatId, runId });
  return client.exec(`printf '${payload}' > agents/reviewer/ctl`);
}

async function waitForComplete(
  client: YashClient,
  runId: string,
  timeoutMs = 3000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await statusOf(client, runId);
    if (status?.state === "complete") {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for run ${runId} to complete`);
}

async function statusOf(client: YashClient, runId: string) {
  const raw = await client
    .exec(`cat agents/reviewer/runs/${runId}/status.json`)
    .catch(() => undefined);
  return raw ? (JSON.parse(raw) as { state: string }) : undefined;
}

function fakeToolClient(calls: LmStudioTurnRequest[]): ToolClient {
  return {
    respond: async (request) => {
      calls.push(request);
      return {
        output: [{ type: "message", content: "Fine." }],
        responseId: "resp_1",
      };
    },
  };
}

function manifestWithoutTools() {
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a terse reviewer.", ' +
    'endpoint: "http://fake.test/api/v1"}}}, capabilities: [chat.completion]}]}'
  );
}

function manifestWithTools() {
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a terse reviewer.", ' +
    'endpoint: "http://fake.test/api/v1", tools: ' +
    '{roots: ["/home/root/agents"]}}}}, capabilities: [chat.completion]}]}'
  );
}
