import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";

import { YashClient } from "../src/protocol/client";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("a manifest-declared fixture stream delivers chunks into a live mount without blocking other clients", async () => {
  const { server, client } = await startedFixtureClient(
    "yafs-fixture-stream-",
    manifest(),
  );
  expect(await client.exec("cat demo/output.txt")).toBe("");
  const other = await YashClient.connect(server.address());
  await assertStaysResponsiveDuringDelivery(other);
  const partial = await waitForContent(
    client,
    "demo/output.txt",
    (content) => content.length > 0,
  );
  expect("one-two-three".startsWith(partial)).toBe(true);
  await waitForExact(client, "demo/output.txt", "one-two-three");
  const inspected = JSON.parse(await client.exec("inspect demo/output.txt"));
  expect(inspected.origins[0].revision).toMatch(/:3$/);
  await client.close();
  await other.close();
  await server.close();
});

async function assertStaysResponsiveDuringDelivery(other: YashClient) {
  const start = Date.now();
  expect(await other.exec("echo still responsive")).toBe("still responsive");
  expect(Date.now() - start).toBeLessThan(50);
}

test("an operator plugin refresh preserves stream progress instead of resetting it", async () => {
  const { server, client } = await startedFixtureClient(
    "yafs-fixture-stream-refresh-",
    manifest(),
  );
  await waitForExact(client, "demo/output.txt", "one-two-three");
  await client.exec("plugins refresh demo");
  expect(await client.exec("cat demo/output.txt")).toBe("one-two-three");
  await client.close();
  await server.close();
});

test("reactivating a mount with a different stream config starts from its own beginning, not stale progress", async () => {
  const { configPath, server, client } = await startedFixtureClient(
    "yafs-fixture-stream-restart-",
    manifest(),
  );
  await waitForExact(client, "demo/output.txt", "one-two-three");
  await client.exec("plugin deactivate demo");
  await writeFile(configPath, otherManifest());
  await client.exec("plugins apply");
  expect(await client.exec("cat demo/output.txt")).toBe("");
  await waitForExact(client, "demo/output.txt", "uno-");
  await client.close();
  await server.close();
});

test("a ctl restart truncates the stream and it resumes delivery from its own beginning", async () => {
  const { server, client } = await startedFixtureClient(
    "yafs-fixture-stream-ctl-",
    manifest(),
  );
  await waitForExact(client, "demo/output.txt", "one-two-three");
  await client.exec(`printf '${restartPayload("output.txt")}' > demo/ctl`);
  expect(await client.exec("ls demo")).not.toContain("ctl");
  await waitForExact(client, "demo/output.txt", "");
  await waitForExact(client, "demo/output.txt", "one-");
  await client.close();
  await server.close();
});

test("a ctl restart naming an unknown stream is rejected without breaking the connection", async () => {
  const { server, client } = await startedFixtureClient(
    "yafs-fixture-stream-ctl-bad-",
    manifest(),
  );
  await expect(
    client.exec(`printf '${restartPayload("nope.txt")}' > demo/ctl`),
  ).rejects.toThrow("Invalid restart");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

async function startedFixtureClient(prefix: string, manifestSource: string) {
  const { directory, configPath, server, client } =
    await startedHostConfigServer(prefix, manifestSource);
  await client.exec("plugins apply");
  return { directory, configPath, server, client };
}

function restartPayload(path: string) {
  return `{"restart":"${path}"}`;
}

function manifest() {
  return (
    "{version: 1, mounts: [{id: demo, path: demo, provider: fixture, " +
    'config: {files: {"output.txt": ""}, streams: {"output.txt": {chunks: ["one-", "two-", "three"], intervalMs: 100}}}, ' +
    "capabilities: []}]}"
  );
}

function otherManifest() {
  return (
    "{version: 1, mounts: [{id: demo, path: demo, provider: fixture, " +
    'config: {files: {"output.txt": ""}, streams: {"output.txt": {chunks: ["uno-", "dos-", "tres"], intervalMs: 100}}}, ' +
    "capabilities: []}]}"
  );
}

function waitForExact(client: YashClient, path: string, value: string) {
  return waitForContent(client, path, (content) => content === value);
}

async function waitForContent(
  client: YashClient,
  path: string,
  matches: (content: string) => boolean,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await client.exec(`cat ${path}`);
    if (matches(content)) {
      return content;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${path} to match`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
