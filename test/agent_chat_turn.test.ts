import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import { manifest, recordingModel, sleep } from "./agent_test_helpers";

test("--chat turns accumulate structured history and each call sees prior turns", async () => {
  const calls: Array<{ role: string; content: string }[]> = [];
  const model = recordingModel(["reply one", "reply two"], calls);
  const modelFor = () => model;
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agent-chat-")),
    modelFor,
  });
  const client = await YashClient.connect(server.address());
  await setUpChat(client);
  await sendTurn(client, "msg1");
  await sendTurn(client, "msg2");
  assertCalls(calls);
  await assertHistory(client);
  await client.close();
  await server.close();
});

async function setUpChat(client: YashClient) {
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
}

async function sendTurn(client: YashClient, message: string) {
  const accepted = await client.exec(
    `agent send agents/reviewer --chat abc "${message}"`,
  );
  const runPath = accepted.split(" -> ")[1];
  await waitForComplete(client, runPath);
}

async function waitForComplete(client: YashClient, runPath: string) {
  for (let i = 0; i < 100; i++) {
    const status = JSON.parse(await client.exec(`cat ${runPath}/status.json`));
    if (status.state === "complete") {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${runPath} to complete`);
}

function assertCalls(calls: Array<{ role: string; content: string }[]>) {
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
    .map((line) => JSON.parse(line));
  expect(lines).toEqual([
    { role: "user", content: "msg1" },
    { role: "assistant", content: "reply one" },
    { role: "user", content: "msg2" },
    { role: "assistant", content: "reply two" },
  ]);
}
