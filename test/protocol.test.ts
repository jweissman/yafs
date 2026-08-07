import { expect, test } from "bun:test";
import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";

test("a yash client talks to a persistent server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-"));
  const walPath = join(directory, "yafs.wal");
  const server = await YafsServer.start({ walPath });
  const client = await YashClient.connect(server.address());
  expect(await client.exec("mkdir notes")).toBe("");
  expect(await client.exec("touch notes/note.md")).toBe("");
  await client.close();
  await server.close();
  const restarted = await YafsServer.start({ walPath });
  const reconnected = await YashClient.connect(restarted.address());
  expect(await reconnected.exec("stat /home/root/notes")).toBe("directory");
  expect(await reconnected.complete("cat notes/n")).toEqual(["notes/note.md"]);
  expect(await reconnected.complete("cat missing/n")).toEqual([]);
  await reconnected.close();
  await restarted.close();
});

test("a structured write RPC round-trips content the command grammar cannot represent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-write-"));
  const server = await YafsServer.start({
    walPath: join(directory, "yafs.wal"),
  });
  const client = await YashClient.connect(server.address());
  await client.exec("mkdir notes");
  const tricky = "it's a $(command) with a $variable and 'quotes'";
  expect(
    (await client.writeFile("notes/tricky.md", tricky)).error,
  ).toBeUndefined();
  expect(await client.exec("cat notes/tricky.md")).toBe(tricky);
  expect(
    (await client.writeFile("notes/tricky.md", "replaced")).error,
  ).toBeUndefined();
  expect(await client.exec("cat notes/tricky.md")).toBe("replaced");
  await client.close();
  await server.close();
});

test("a structured write RPC honors read-only mount rejection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-write-mount-"));
  const server = await YafsServer.start({
    walPath: join(directory, "yafs.wal"),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(
    "printf '{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hi}}, capabilities: []}]}' > .yafsmeta",
  );
  await client.exec("mount activate .yafsmeta");
  expect(
    (await client.writeFile("fixture/hello.txt", "nope")).error?.code,
  ).toBe("read_only_mount");
  await client.close();
  await server.close();
});

test("a yash client rejects unsupported and failed protocol replies", async () => {
  const server = createServer((socket) =>
    socket.on("data", () => socket.write(protocolFailure())),
  );
  await listen(server);
  const client = await YashClient.connect(address(server));
  await expect(client.exec("pwd")).rejects.toThrow(
    "Unsupported protocol version",
  );
  await client.close();
  await close(server);
});

test("a malformed or empty-payload request closes only that client connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-protocol-"));
  const server = await YafsServer.start({
    walPath: join(directory, "yafs.wal"),
  });
  await waitForClose(createConnection(server.address()), "not-json\n");
  await waitForClose(
    createConnection(server.address()),
    '{"version":1,"id":1}\n',
  );
  const client = await YashClient.connect(server.address());
  expect(await client.exec("pwd")).toBe("/home/root");
  await client.close();
  await server.close();
});

test("journal recovers torn tails and rejects earlier corruption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-recovery-"));
  const wal = join(directory, "journal.ndjson");
  const server = await YafsServer.start({ walPath: wal });
  const client = await YashClient.connect(server.address());
  await client.exec("touch durable");
  await client.close();
  await server.close();
  await appendFile(wal, '{"torn"');
  const recovered = await YafsServer.start({ walPath: wal });
  const restored = await YashClient.connect(recovered.address());
  expect(await restored.exec("stat durable")).toBe("file");
  await restored.close();
  await recovered.close();
  await appendFile(wal, "bad record\n");
  await expect(YafsServer.start({ walPath: wal })).rejects.toThrow(
    "Corrupt journal record",
  );
});

test("journal restores snapshots with stale pre-compaction WAL records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-snapshot-crash-"));
  const wal = join(directory, "journal.ndjson");
  const server = await YafsServer.start({ dataDir: directory });
  const client = await YashClient.connect(server.address());
  for (let index = 0; index < 31; index++) {
    await client.exec(`touch item-${index}`);
  }
  const staleWal = await readFile(wal, "utf8");
  await client.exec("touch item-31");
  await client.close();
  await server.close();
  await writeFile(wal, staleWal);
  const restarted = await YafsServer.start({ dataDir: directory });
  const reconnected = await YashClient.connect(restarted.address());
  expect(await reconnected.exec("stat item-31")).toBe("file");
  await reconnected.close();
  await restarted.close();
});

function waitForClose(
  socket: ReturnType<typeof createConnection>,
  payload: string,
) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", () => socket.write(payload));
    socket.once("close", resolve);
    socket.once("error", reject);
  });
}

function protocolFailure() {
  return '{"version":2,"id":1,"error":{"code":"unsupported","message":"unsupported"}}\n';
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function address(server: ReturnType<typeof createServer>) {
  const value = server.address();
  if (!value || typeof value === "string") {
    throw new Error("Server is not listening");
  }
  return { host: value.address, port: value.port };
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
