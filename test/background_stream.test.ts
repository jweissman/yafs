import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AbsolutePath } from "../src/core/AbsolutePath";
import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";

test("a slow background delivery does not block other clients while it is in flight", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-stream-")),
  });
  const writer = await YashClient.connect(server.address());
  await writer.exec("mkdir stream");
  const delivery = deliver(
    server,
    "/home/root/stream/output.txt",
    ["one", "two", "three"],
    200,
  );
  const reader = await YashClient.connect(server.address());
  const start = Date.now();
  expect(await reader.exec("echo still responsive")).toBe("still responsive");
  expect(Date.now() - start).toBeLessThan(100);
  await delivery;
  expect(await reader.exec("cat stream/output.txt")).toBe("onetwothree");
  await writer.close();
  await reader.close();
  await server.close();
});

test("a client can read partial content mid-delivery, not just the final result", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-stream-partial-")),
  });
  const writer = await YashClient.connect(server.address());
  await writer.exec("mkdir stream");
  const delivery = deliver(
    server,
    "/home/root/stream/output.txt",
    ["first-", "second-", "third"],
    150,
  );
  await sleep(180);
  const reader = await YashClient.connect(server.address());
  expect(await reader.exec("cat stream/output.txt")).toBe("first-");
  await delivery;
  expect(await reader.exec("cat stream/output.txt")).toBe("first-second-third");
  await writer.close();
  await reader.close();
  await server.close();
});

test("a registered ctl handler intercepts real shell redirection, not just a raw write RPC", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-ctl-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  const path = "/home/root/stream/output.txt" as AbsolutePath;
  server.registerCtl(
    "/home/root/stream/ctl" as AbsolutePath,
    restart(server, path, ["one-", "two-", "three"], 60),
  );
  const start = Date.now();
  await client.exec("printf restart > stream/ctl");
  expect(Date.now() - start).toBeLessThan(50);
  expect(await client.exec("ls stream")).toBe("output.txt");
  await sleep(250);
  expect(await client.exec("cat stream/output.txt")).toBe("one-two-three");
  await client.close();
  await server.close();
});

test("unregistering a ctl handler restores ordinary write behavior for that path", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-ctl-unregister-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  const ctlPath = "/home/root/stream/ctl" as AbsolutePath;
  server.registerCtl(ctlPath, () => {});
  server.unregisterCtl(ctlPath);
  await client.exec("printf hello > stream/ctl");
  expect(await client.exec("cat stream/ctl")).toBe("hello");
  await client.close();
  await server.close();
});

test("a synchronously throwing ctl handler rejects the write without breaking the connection", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-ctl-error-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl("/home/root/stream/ctl" as AbsolutePath, () => {
    throw new Error("boom");
  });
  await expect(client.exec("printf go > stream/ctl")).rejects.toThrow("boom");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

test("an asynchronously rejecting ctl handler rejects the write without breaking the connection", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-ctl-async-error-")),
  });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl("/home/root/stream/ctl" as AbsolutePath, async () => {
    throw new Error("boom");
  });
  await expect(client.exec("printf go > stream/ctl")).rejects.toThrow("boom");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

function restart(
  server: YafsServer,
  path: AbsolutePath,
  chunks: string[],
  intervalMs: number,
): () => Promise<void> {
  return async () => {
    void stream(server, path, chunks, intervalMs);
  };
}

async function stream(
  server: YafsServer,
  path: AbsolutePath,
  chunks: string[],
  intervalMs: number,
) {
  await server.commitBackground([
    { type: "write", path, content: "", at: new Date().toISOString() },
  ]);
  await deliver(server, path, chunks, intervalMs);
}

async function deliver(
  server: YafsServer,
  path: AbsolutePath,
  chunks: string[],
  intervalMs: number,
) {
  let content = "";
  for (const chunk of chunks) {
    await sleep(intervalMs);
    content += chunk;
    await server.commitBackground([
      { type: "write", path, content, at: new Date().toISOString() },
    ]);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
