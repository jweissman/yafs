import { expect, test } from "bun:test";

import {
  fakeMessageModel,
  slowModel,
  waitForRun,
  waitForStatus,
  manifest,
} from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a ctl message without chat.completion granted is rejected before it starts a run", async () => {
  const calls: string[] = [];
  const ungranted = manifest({ reviewer: "prompt" }).replace(
    "[chat.completion]",
    "[]",
  );
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-nocap-",
    ungranted,
    { modelFor: () => fakeMessageModel(calls) },
  );
  await client.exec("plugins apply");
  await expect(
    client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl'),
  ).rejects.toThrow("not granted");
  expect(calls).toEqual([]);
  expect(await client.exec("ls agents/reviewer")).not.toContain("runs");
  await client.close();
  await server.close();
});

test("a malformed ctl message is rejected without breaking the connection", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-bad-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => fakeMessageModel([]) },
  );
  await client.exec("plugins apply");
  await expect(
    client.exec("printf notjson > agents/reviewer/ctl"),
  ).rejects.toThrow("JSON Parse");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

test("an agent ctl message with a non-string message or context is rejected clearly", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-badfields-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => fakeMessageModel([]) },
  );
  await client.exec("plugins apply");
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
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-slow-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => slowModel("done", 50) },
  );
  await client.exec("plugins apply");
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForRun(client, "agents/reviewer/runs");
  expect(runId).toBeDefined();
  await expect(
    waitForStatus(client, "agents/reviewer/runs", () => false, 20),
  ).rejects.toThrow("Timed out waiting for a matching status");
  await client.close();
  await server.close();
});
