import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import {
  fakeMessageModel,
  slowModel,
  waitForRun,
  waitForStatus,
  manifest,
} from "./agent_test_helpers";

test("a ctl message without chat.completion granted is rejected before it starts a run", async () => {
  const calls: string[] = [];
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-nocap-")),
    modelFor: () => fakeMessageModel(calls),
  });
  const client = await YashClient.connect(server.address());
  const ungranted = manifest({ reviewer: "prompt" }).replace(
    "[chat.completion]",
    "[]",
  );
  await client.exec(`printf '${ungranted}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  await expect(
    client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl'),
  ).rejects.toThrow("not granted");
  expect(calls).toEqual([]);
  expect(await client.exec("ls agents/reviewer")).not.toContain("runs");
  await client.close();
  await server.close();
});

test("a malformed ctl message is rejected without breaking the connection", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-bad-")),
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  await expect(
    client.exec("printf notjson > agents/reviewer/ctl"),
  ).rejects.toThrow("JSON Parse");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

test("an agent ctl message with a non-string message or context is rejected clearly", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-badfields-")),
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  await expect(
    client.exec("printf '{\"message\":5}' > agents/reviewer/ctl"),
  ).rejects.toThrow("Invalid agent action");
  await expect(
    client.exec(
      'printf \'{"message":"hi","context":5}\' > agents/reviewer/ctl',
    ),
  ).rejects.toThrow("Invalid agent action");
  await client.close();
  await server.close();
});

test("waitForRun polls across a slow-completing run, and waitForStatus times out on one that never finishes", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-slow-")),
    modelFor: () => slowModel("done", 50),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForRun(client, "agents/reviewer/runs");
  expect(runId).toBeDefined();
  await expect(
    waitForStatus(client, "agents/reviewer/runs", () => false, 20),
  ).rejects.toThrow("Timed out waiting for a matching status");
  await client.close();
  await server.close();
});
