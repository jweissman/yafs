import { expect, test } from "bun:test";
import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";
import {
  waitForClose,
  protocolFailure,
  listen,
  address,
  close,
} from "./raw_socket_helpers";

test("a yash client talks to a persistent server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-"));
  const walPath = join(directory, "yafs.wal");
  const server = await YafsServer.start({ walPath });
  const client = await YashClient.connect(server.address());
  expect(await client.exec("mkdir notes")).toBe("");
  expect(await client.exec("touch notes/note.md")).toBe("");
  expect(
    (await client.operation({ name: "list", path: "notes" })).value,
  ).toEqual({
    kind: "list",
    path: "/home/root/notes",
    entries: ["note.md"],
  });
  expect((await client.operation({ name: "startHere" })).value).toMatchObject({
    kind: "startHere",
    principal: "root",
  });
  expect(server.agentToolsPort()).toBeGreaterThan(0);
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
  const { server, client } = await startedHostConfigServer(
    "yafs-write-mount-",
    "{version: 1, plugins: [{id: demo, path: fixture, plugin: fixture, config: {files: {hello.txt: hi}}, capabilities: []}]}",
  );
  await client.exec("plugins apply");
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

test("a client fails every pending request when the connection closes unexpectedly", async () => {
  const server = createServer((socket) =>
    socket.on("data", () => socket.destroy()),
  );
  await listen(server);
  const client = await YashClient.connect(address(server));
  await expect(client.exec("pwd")).rejects.toThrow("Connection closed");
  await close(server);
});

test("connect rejects when nothing is listening on the target port", async () => {
  const server = createServer();
  await listen(server);
  const refusedAddress = address(server);
  await close(server);
  await expect(YashClient.connect(refusedAddress)).rejects.toThrow();
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
