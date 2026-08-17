import { expect, test } from "bun:test";

import { YashClient } from "../../src/protocol/client";
import { manifest, recordingModel, sleep } from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("--chat turns accumulate structured history and each call sees prior turns", async () => {
  const calls: { role: string; content: string }[][] = [];
  const model = recordingModel(["reply one", "reply two"], calls);
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-chat-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => model },
  );
  await client.exec("plugins apply");
  await sendTurn(client, "msg1");
  await sendTurn(client, "msg2");
  assertCalls(calls);
  await assertHistory(client);
  await client.close();
  await server.close();
});

async function sendTurn(client: YashClient, message: string) {
  const accepted = await client.exec(
    `agent send agents/reviewer --chat abc "${message}"`,
  );
  const runPath = accepted.split(" -> ")[1];
  await waitForComplete(client, runPath);
}

async function waitForComplete(client: YashClient, runPath: string) {
  for (let i = 0; i < 100; i++) {
    const status = runStatus(await client.exec(`cat ${runPath}/status.json`));
    if (status.state === "complete") {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${runPath} to complete`);
}

function assertCalls(calls: { role: string; content: string }[][]) {
  expect(calls[0]).toEqual([
    { role: "system", content: "prompt" },
    { role: "user", content: "msg1" },
  ]);
  expect(calls[1]).toEqual([
    { role: "system", content: "prompt" },
    { role: "user", content: "msg1" },
    { role: "assistant", content: "reply one" },
    { role: "user", content: "msg2" },
  ]);
}

async function assertHistory(client: YashClient) {
  const lines = (
    await client.exec("cat agents/reviewer/chats/abc/messages.ndjson")
  )
    .split("\n")
    .map(chatMessage);
  expect(lines).toEqual([
    { role: "user", content: "msg1" },
    { role: "assistant", content: "reply one" },
    { role: "user", content: "msg2" },
    { role: "assistant", content: "reply two" },
  ]);
}

function runStatus(raw: string): { state: string } {
  return JSON.parse(raw) as { state: string };
}

function chatMessage(raw: string): { role: string; content: string } {
  return JSON.parse(raw) as { role: string; content: string };
}
