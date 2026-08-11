import { expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import Yafs from "../../src";
import { YashClient } from "../../src/protocol/client";
import { YafsServer } from "../../src/protocol/server";
import { parseManifest } from "../../src/mounts/Manifest";
import {
  auditSequences,
  expectInvalidManifest,
  fixtureManifest,
  invalidManifests,
} from "../mount_manifest_helpers";
import {
  activateDesired,
  startedHostConfigServer,
} from "../desired_mount_helpers";

test("a validated manifest activates a read-only fixture mount with provenance", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, fixtureManifest());
  verifyFixture(yafs);
  const origin = JSON.parse(yafs.exec("inspect fixture/hello.txt")).origins[0];
  expect(origin).toMatchObject({
    kind: "provider",
    mountId: "demo",
    provider: "fixture",
  });
});

test("mount activation persists state, audit, and fixture content across restart", async () => {
  const { directory, configPath, server, client } =
    await startedHostConfigServer("yafs-mount-", fixtureHostConfig());
  await client.exec("plugins apply");
  await client.close();
  await server.close();
  await access(join(directory, "mounts.json"));
  await access(join(directory, "audit.ndjson"));
  const auditText = await readFile(join(directory, "audit.ndjson"), "utf8");
  expect(auditText).toContain('"afterRevision":"fixture:');
  const restarted = await YafsServer.start({ dataDir: directory, configPath });
  const restored = await YashClient.connect(restarted.address());
  expect(await restored.exec("cat /home/root/fixture/hello.txt")).toBe("hello");
  await restored.exec("plugin deactivate demo");
  await restored.exec("plugins apply");
  await restored.close();
  await restarted.close();
  const auditLog = await readFile(join(directory, "audit.ndjson"), "utf8");
  expect(auditSequences(auditLog)).toEqual([1, 2, 3]);
});

test("mount manifests reject unknown fields and unmount removes the provider view", async () => {
  expect(() =>
    parseManifest("{version: 1, mounts: [], unknown: true}"),
  ).toThrow(
    "Unknown manifest field: unknown (expected one of: version, plugins, mounts)",
  );
  const yafs = new Yafs();
  const ungranted = fixtureManifest().replace(
    "capabilities: []",
    "capabilities: [network]",
  );
  await expect(activateDesired(yafs, ungranted)).rejects.toThrow(
    "Capabilities are not granted: network",
  );
  await activateDesired(yafs, fixtureManifest());
  expect(yafs.exec("plugin deactivate demo")).toBe("demo deactivated");
  expect(yafs.execute("cat fixture/hello.txt").error?.code).toBe("not_found");
});

test("mount manifests reject duplicate keys, YAML tags, aliases, and anchors", () => {
  invalidManifests().forEach((manifest) => expectInvalidManifest(manifest));
});

test("fixture snapshots participate in links, unions, and provenance", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, fixtureManifest());
  yafs.exec("mkdir notes");
  yafs.exec("echo local > notes/alice.md");
  yafs.exec("ln -s fixture/hello.txt latest");
  yafs.exec("union review notes fixture");
  expect(yafs.exec("cat latest")).toBe("hello");
  expect(yafs.exec("ls review")).toBe("alice.md\nhello.txt");
  const origin = JSON.parse(yafs.exec("inspect review/hello.txt")).origins[0];
  expect(origin).toMatchObject({
    kind: "provider",
    mountId: "demo",
    provider: "fixture",
  });
});

test("a mount may not replace an existing local node", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir fixture");
  await expect(activateDesired(yafs, fixtureManifest())).rejects.toThrow(
    "Mount path already exists: /home/root/fixture",
  );
});

test("nested snapshot files survive replay and disappear after durable unmount", async () => {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-mount-replay-",
    nestedFixtureHostConfig(),
  );
  await client.exec("plugins apply");
  await client.close();
  await server.close();
  const restarted = await YafsServer.start({ dataDir: directory });
  const restored = await YashClient.connect(restarted.address());
  const nested = await restored.exec("cat /home/root/fixture/nested/hello.txt");
  expect(nested).toBe("hello");
  await restored.exec("plugin deactivate demo");
  await restored.close();
  await restarted.close();
  const afterUnmount = await YafsServer.start({ dataDir: directory });
  const verified = await YashClient.connect(afterUnmount.address());
  const missing = await verified.execute(
    "cat /home/root/fixture/nested/hello.txt",
  );
  expect(missing.error?.code).toBe("not_found");
  await verified.close();
  await afterUnmount.close();
});

function fixtureHostConfig() {
  return "{version: 1, plugins: [{id: demo, path: fixture, plugin: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}

function nestedFixtureHostConfig() {
  return "{version: 1, plugins: [{id: demo, path: fixture, plugin: fixture, config: {files: {nested/hello.txt: hello}}, capabilities: []}]}";
}

function verifyFixture(yafs: Yafs) {
  expect(yafs.exec("ls")).toContain("fixture");
  expect(yafs.exec("cat fixture/hello.txt")).toBe("hello");
  expect(yafs.execute("readlink fixture/hello.txt").stderr).toContain(
    "Not a symbolic link",
  );
  expect(yafs.exec("mounts")).toContain(
    "demo /home/root/fixture fixture active",
  );
  expect(yafs.execute("echo changed > fixture/hello.txt").error?.code).toBe(
    "read_only_mount",
  );
  expect(yafs.execute("touch fixture").error?.code).toBe("read_only_mount");
}
