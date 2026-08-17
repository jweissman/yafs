import { expect, test } from "bun:test";

import { sleep } from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { YashClient } from "../../src/protocol/client";
import {
  LmStudioTurn,
  LmStudioTurnRequest,
  ToolClient,
} from "../../src/plugins/agent/LmStudioMcpClient";
import { yafsKey } from "../../src/plugins/agent/LmStudioMcpJson";
import { parseJson } from "../json";

test("a tool-enabled persona routes through LM Studio's native chat endpoint and records a durable transcript", async () => {
  const calls: LmStudioTurnRequest[] = [];
  const client = fakeToolClient(calls, [
    turn("Looks fine.", "resp_1"),
    turn("Second reply.", "resp_2"),
  ]);
  const { server, client: yash } = await startedHostConfigServer(
    "yafs-agent-tools-",
    manifest(),
    { toolClientFor: () => client },
  );
  await yash.exec("plugins apply");
  await assertFirstTurn(yash, calls);
  await assertThreadedSecondTurn(yash, calls);
  await yash.close();
  await server.close();
});

async function assertFirstTurn(yash: YashClient, calls: LmStudioTurnRequest[]) {
  await send(yash, "run-1", "hi", "c1");
  await waitForComplete(yash, "run-1");
  expect(await yash.exec("cat agents/reviewer/runs/run-1/response.md")).toBe(
    "Looks fine.\n\n---\n1 tool call(s) this turn, in 0s.",
  );
  const transcript = parseJson(
    await yash.exec("cat agents/reviewer/runs/run-1/tools.json"),
  );
  expect(transcript).toEqual([
    { type: "tool_call", tool: "yafs.read", arguments: {}, output: "..." },
    { type: "message", content: "Looks fine." },
  ]);
  expect(await threadId(yash)).toBe("resp_1");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    input: "hi",
    integrations: [
      { type: "plugin", id: `mcp/${yafsKey("agents", "reviewer")}` },
    ],
    previousResponseId: undefined,
  });
  expect(calls[0].systemPrompt).toContain("/home/root/agents");
}

async function assertThreadedSecondTurn(
  yash: YashClient,
  calls: LmStudioTurnRequest[],
) {
  await send(yash, "run-2", "again", "c1");
  await waitForComplete(yash, "run-2");
  expect(calls).toHaveLength(2);
  expect(calls[1].previousResponseId).toBe("resp_1");
  expect(await threadId(yash)).toBe("resp_2");
}

function threadId(client: YashClient) {
  return client.exec("cat agents/reviewer/chats/c1/lmstudio-response-id.txt");
}

test("a tool-enabled persona works without a chatId, with no threading", async () => {
  const calls: LmStudioTurnRequest[] = [];
  const client = fakeToolClient(calls, [turn("Fine.", "resp_1")]);
  const { server, client: yash } = await startedHostConfigServer(
    "yafs-agent-tools-",
    manifest(),
    { toolClientFor: () => client },
  );
  await yash.exec("plugins apply");

  await yash.exec(
    'printf \'{"message":"hi","runId":"run-1"}\' > agents/reviewer/ctl',
  );
  await waitForComplete(yash, "run-1");
  expect(calls[0].previousResponseId).toBeUndefined();

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
    const current = await statusOf(client, runId);
    if (current?.state === "complete") {
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

function turn(message: string, responseId: string): LmStudioTurn {
  return {
    output: [
      { type: "tool_call", tool: "yafs.read", arguments: {}, output: "..." },
      { type: "message", content: message },
    ],
    responseId,
  };
}

function fakeToolClient(
  calls: LmStudioTurnRequest[],
  turns: LmStudioTurn[],
): ToolClient {
  return {
    respond: async (request) => {
      calls.push(request);
      return turns[calls.length - 1];
    },
  };
}

function manifest() {
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a terse reviewer.", ' +
    'endpoint: "http://fake.test/api/v1", tools: {roots: ' +
    '["/home/root/agents"]}}}}, capabilities: [chat.completion]}]}'
  );
}
