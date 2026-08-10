import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";

test("evidence operations journal and restore exact captured bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-evidence-"));
  const server = await YafsServer.start({ walPath: join(directory, "yafs.wal") });
  const client = await YashClient.connect(server.address());
  await setup(client);
  await captureAndRestore(client);
  await client.close();
  await server.close();
  await restoresAfterRestart(directory);
});

async function setup(client: YashClient) {
  await client.exec("mkdir source");
  await client.exec("mkdir artifacts");
  await client.exec("echo captured > source/evidence.md");
}

async function captureAndRestore(client: YashClient) {
  expect((await client.operation({
    name: "capture", source: "source", artifact: "artifacts/one",
  })).value).toMatchObject({ kind: "capture", entries: 1 });
  await client.exec("echo current > source/evidence.md");
  expect((await client.operation({
    name: "restore", artifact: "artifacts/one", destination: "restored",
  })).value).toMatchObject({ kind: "restore", entries: 1 });
  expect(await client.exec("cat restored/evidence.md")).toBe("captured");
}

async function restoresAfterRestart(directory: string) {
  const server = await YafsServer.start({ walPath: join(directory, "yafs.wal") });
  const client = await YashClient.connect(server.address());
  expect(await client.exec("cat restored/evidence.md")).toBe("captured");
  await client.close();
  await server.close();
}
