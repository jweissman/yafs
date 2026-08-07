import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";

test("a manifest-declared fixture stream delivers chunks into a live mount without blocking other clients", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-fixture-stream-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  expect(await client.exec("cat demo/output.txt")).toBe("");
  const other = await YashClient.connect(server.address());
  await assertStaysResponsiveDuringDelivery(other);
  const partial = await waitForContent(
    client,
    "demo/output.txt",
    (content) => content.length > 0,
  );
  expect("one-two-three".startsWith(partial)).toBe(true);
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "one-two-three",
  );
  expect(
    JSON.parse(await client.exec("inspect demo/output.txt")).origins[0]
      .revision,
  ).toMatch(/:3$/);
  await client.close();
  await other.close();
  await server.close();
});

async function assertStaysResponsiveDuringDelivery(other: YashClient) {
  const start = Date.now();
  expect(await other.exec("echo still responsive")).toBe("still responsive");
  expect(Date.now() - start).toBeLessThan(50);
}

test("an operator mount refresh preserves stream progress instead of resetting it", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-fixture-stream-refresh-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "one-two-three",
  );
  await client.exec("mount refresh .yafsmeta demo");
  expect(await client.exec("cat demo/output.txt")).toBe("one-two-three");
  await client.close();
  await server.close();
});

test("reactivating a mount with a different stream config starts from its own beginning, not stale progress", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-fixture-stream-restart-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "one-two-three",
  );
  await client.exec("mount unmount demo");
  await client.exec(`printf '${otherManifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  expect(await client.exec("cat demo/output.txt")).toBe("");
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "uno-",
  );
  await client.close();
  await server.close();
});

test("a ctl restart truncates the stream and it resumes delivery from its own beginning", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-fixture-stream-ctl-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "one-two-three",
  );
  await client.exec(`printf '${restartPayload("output.txt")}' > demo/ctl`);
  expect(await client.exec("ls demo")).not.toContain("ctl");
  await waitForContent(client, "demo/output.txt", (content) => content === "");
  await waitForContent(
    client,
    "demo/output.txt",
    (content) => content === "one-",
  );
  await client.close();
  await server.close();
});

test("a ctl restart naming an unknown stream is rejected without breaking the connection", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-fixture-stream-ctl-bad-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await expect(
    client.exec(`printf '${restartPayload("nope.txt")}' > demo/ctl`),
  ).rejects.toThrow("Invalid restart");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

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
