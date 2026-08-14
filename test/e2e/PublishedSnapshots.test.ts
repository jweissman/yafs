import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";

import Yafs from "../../src";
import { MountManager } from "../../src/mounts/MountManager";
import { YashClient } from "../../src/protocol/client";
import { YafsServer } from "../../src/protocol/server";
import { NodeStore } from "../../src/vfs/NodeStore";
import {
  activateDesired,
  refreshDesired,
  startedHostConfigServer,
} from "../desired_mount_helpers";

test("a refresh republishes one snapshot for direct, link, and union reads", async () => {
  const yafs = await mountedWorkspace();
  yafs.exec("ln -s fixture/hello.txt latest");
  yafs.exec("mkdir notes");
  yafs.exec("echo local > notes/local.txt");
  yafs.exec("union review notes fixture");
  await refreshDesired(yafs, fixtureManifest("updated"));
  expect(yafs.exec("cat fixture/hello.txt")).toBe("updated");
  expect(yafs.exec("cat latest")).toBe("updated");
  expect(yafs.exec("cat review/hello.txt")).toBe("updated");
  expect(yafs.execute("echo changed > fixture/hello.txt").error?.code).toBe(
    "read_only_mount",
  );
  expect(yafs.execute("echo changed > review/new.txt").error?.code).toBe(
    "read_only_mount",
  );
});

test("a bounded snapshot is rejected before it becomes a mount", async () => {
  const store = new NodeStore();
  const mounts = new MountManager(store, { limits: { files: 0, bytes: 1 } });
  const yafs = new Yafs({ store, mounts });
  await expect(activateDesired(yafs, fixtureManifest("hello"))).rejects.toThrow(
    "Snapshot exceeds 0 files",
  );
  expect(yafs.execute("cat fixture/hello.txt").error?.code).toBe("not_found");
});

test("an unmounted union layer disappears and a remount rejoins by path", async () => {
  const yafs = await mountedWorkspace();
  yafs.exec("mkdir notes");
  yafs.exec("echo local > notes/local.txt");
  yafs.exec("ln -s fixture/hello.txt latest");
  yafs.exec("union review notes fixture");
  const revision = fixtureRevision(yafs);
  yafs.exec("plugin deactivate demo");
  expect(yafs.exec("ls review")).toBe("local.txt");
  expect(yafs.execute("cat review/hello.txt").error?.code).toBe("not_found");
  expect(yafs.execute("cat latest").error?.code).toBe("not_found");
  await activateDesired(yafs, fixtureManifest("again"));
  expect(yafs.exec("cat review/hello.txt")).toBe("again");
  expect(yafs.exec("cat latest")).toBe("again");
  expect(fixtureRevision(yafs)).not.toBe(revision);
});

test("recovery preserves a union through refresh, unmount, and remount", async () => {
  const { directory, configPath, server, client } =
    await startedHostConfigServer("yafs-refresh-", hostConfig("hello"));
  await client.exec("plugins apply");
  await client.exec("mkdir notes");
  await client.exec("union review notes fixture");
  await writeFile(configPath, hostConfig("recovered"));
  await client.exec("plugins refresh demo");
  await client.exec("plugin deactivate demo");
  await client.exec("plugins apply");
  await client.close();
  await server.close();
  const restored = await YafsServer.start({ dataDir: directory, configPath });
  const verified = await YashClient.connect(restored.address());
  expect(await verified.exec("cat /home/root/review/hello.txt")).toBe(
    "recovered",
  );
  await verified.close();
  await restored.close();
});

async function mountedWorkspace() {
  const yafs = new Yafs();
  await activateDesired(yafs, fixtureManifest("hello"));
  return yafs;
}

function fixtureManifest(content: string) {
  return `{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: ${content}}}, capabilities: []}]}`;
}

function hostConfig(content: string) {
  return `{version: 1, plugins: [{id: demo, path: fixture, plugin: fixture, config: {files: {hello.txt: ${content}}}, capabilities: []}]}`;
}

function fixtureRevision(yafs: Yafs) {
  return JSON.parse(yafs.exec("inspect fixture/hello.txt")).origins[0].revision;
}
