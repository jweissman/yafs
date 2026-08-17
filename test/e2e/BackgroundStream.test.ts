import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AbsolutePath } from "../../src/core/AbsolutePath";
import { YashClient } from "../../src/protocol/client";
import { YafsServer } from "../../src/protocol/server";

interface Delivery {
  path: AbsolutePath;
  chunks: string[];
  intervalMs: number;
}

test("a slow background delivery does not block other clients while it is in flight", async () => {
  const server = await startedServer("yafs-stream-");
  const writer = await YashClient.connect(server.address());
  await writer.exec("mkdir stream");
  const delivery = deliver(server, outputPath(), ["one", "two", "three"], 200);
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
  const server = await startedServer("yafs-stream-partial-");
  const writer = await YashClient.connect(server.address());
  await writer.exec("mkdir stream");
  const delivery = deliver(
    server,
    outputPath(),
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
  const server = await startedServer("yafs-ctl-");
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl(
    ctlPath(),
    restart(server, outputPath(), ["one-", "two-", "three"], 60),
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
  const server = await startedServer("yafs-ctl-unregister-");
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl(ctlPath(), () => undefined);
  server.unregisterCtl(ctlPath());
  await client.exec("printf hello > stream/ctl");
  expect(await client.exec("cat stream/ctl")).toBe("hello");
  await client.close();
  await server.close();
});

test("dispatchCtl invokes a registered control path directly", async () => {
  const server = await startedServer("yafs-ctl-dispatch-");
  let received = "";
  server.registerCtl(ctlPath(), (payload) => {
    received = payload;
  });
  expect(await server.dispatchCtl(ctlPath(), "direct")).toBe(true);
  expect(received).toBe("direct");
  await server.close();
});

test("a synchronously throwing ctl handler rejects the write without breaking the connection", async () => {
  const server = await startedServer("yafs-ctl-error-");
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl(ctlPath(), () => {
    throw new Error("boom");
  });
  await expect(client.exec("printf go > stream/ctl")).rejects.toThrow("boom");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

test("an asynchronously rejecting ctl handler rejects the write without breaking the connection", async () => {
  const server = await startedServer("yafs-ctl-async-error-");
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir stream");
  server.registerCtl(ctlPath(), async () => {
    throw new Error("boom");
  });
  await expect(client.exec("printf go > stream/ctl")).rejects.toThrow("boom");
  expect(await client.exec("echo still alive")).toBe("still alive");
  await client.close();
  await server.close();
});

async function startedServer(prefix: string) {
  return YafsServer.start({ dataDir: await mkdtemp(join(tmpdir(), prefix)) });
}

function outputPath(): AbsolutePath {
  return "/home/root/stream/output.txt";
}

function ctlPath(): AbsolutePath {
  return "/home/root/stream/ctl";
}

function restart(
  server: YafsServer,
  path: AbsolutePath,
  chunks: string[],
  intervalMs: number,
): () => Promise<void> {
  return async () => {
    void stream(server, { path, chunks, intervalMs });
  };
}

async function stream(server: YafsServer, delivery: Delivery) {
  await server.commitBackground([
    {
      type: "write",
      path: delivery.path,
      content: "",
      at: new Date().toISOString(),
    },
  ]);
  await deliver(server, delivery.path, delivery.chunks, delivery.intervalMs);
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
