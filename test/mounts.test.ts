import { expect, test } from "bun:test";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import {
  auditSequences,
  expectInvalidManifest,
  fixtureManifest,
  invalidManifests,
  nestedFixtureManifest,
} from "./mount_manifest_helpers";

test("a validated manifest activates a read-only fixture mount with provenance", () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  verifyFixture(yafs);
  const origin = JSON.parse(yafs.exec("inspect fixture/hello.txt")).origins[0];
  expect(origin).toMatchObject({
    kind: "provider",
    mountId: "demo",
    provider: "fixture",
  });
});

test("mount activation persists state, audit, and fixture content across restart", async () => {
  const { directory, server, client } = await startedServer("yafs-mount-");
  await client.exec(`printf '${fixtureManifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await client.close();
  await server.close();
  await access(join(directory, "mounts.json"));
  await access(join(directory, "audit.ndjson"));
  const auditText = await readFile(join(directory, "audit.ndjson"), "utf8");
  expect(auditText).toContain('"afterRevision":"fixture:');
  const restarted = await YafsServer.start({ dataDir: directory });
  const restored = await YashClient.connect(restarted.address());
  expect(await restored.exec("cat /home/root/fixture/hello.txt")).toBe("hello");
  await restored.exec("mount unmount demo");
  await restored.exec("mount activate .yafsmeta");
  await restored.close();
  await restarted.close();
  const auditLog = await readFile(join(directory, "audit.ndjson"), "utf8");
  expect(auditSequences(auditLog)).toEqual([1, 2, 3]);
});

test("mount manifests reject unknown fields and unmount removes the provider view", () => {
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/.yafsmeta",
    "{version: 1, mounts: [], unknown: true}",
  );
  expect(yafs.execute("mount validate .yafsmeta").stderr).toBe(
    "Unknown manifest field: unknown (expected one of: version, plugins, mounts)",
  );
  yafs.store.write(
    "/home/root/.yafsmeta",
    fixtureManifest().replace("capabilities: []", "capabilities: [network]"),
  );
  expect(yafs.execute("mount activate .yafsmeta").stderr).toBe(
    "Capabilities are not granted: network",
  );
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  yafs.exec("mount activate .yafsmeta");
  expect(yafs.exec("mount unmount demo")).toBe("demo unmounted");
  expect(yafs.execute("cat fixture/hello.txt").error?.code).toBe("not_found");
});

test("mount manifests reject duplicate keys, YAML tags, aliases, and anchors", () => {
  const yafs = new Yafs();
  invalidManifests().forEach((manifest) =>
    expectInvalidManifest(yafs, manifest),
  );
});

test("fixture snapshots participate in links, unions, and provenance", () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  yafs.exec("mount activate .yafsmeta");
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

test("a mount may not replace an existing local node", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir fixture");
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  expect(yafs.execute("mount activate .yafsmeta").stderr).toBe(
    "Mount path already exists: /home/root/fixture",
  );
});

test("nested snapshot files survive replay and disappear after durable unmount", async () => {
  const { directory, server, client } =
    await startedServer("yafs-mount-replay-");
  await client.exec(`printf '${nestedFixtureManifest()}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await client.close();
  await server.close();
  const restarted = await YafsServer.start({ dataDir: directory });
  const restored = await YashClient.connect(restarted.address());
  const nested = await restored.exec("cat /home/root/fixture/nested/hello.txt");
  expect(nested).toBe("hello");
  await restored.exec("mount unmount demo");
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

async function startedServer(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const server = await YafsServer.start({ dataDir: directory });
  const client = await YashClient.connect(server.address());
  return { directory, server, client };
}

function verifyFixture(yafs: Yafs) {
  expect(yafs.exec("mount validate .yafsmeta")).toContain('"id":"demo"');
  expect(yafs.exec("mount activate .yafsmeta")).toBe("demo active");
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
