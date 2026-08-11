import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";
import Yafs from "../../src";
import { activateDesired } from "../desired_mount_helpers";

test("the daemon reconciles its selected configuration without exposing a host path to yash", async () => {
  const { client, server, config } = await startedDesiredServer(
    "yafs-desired-",
    "first",
  );
  await assertInitialReconciliation(client);
  await assertReactsToConfigChanges(client, config);
  await client.close();
  await server.close();
});

async function assertInitialReconciliation(client: YashClient) {
  await assertAgentPluginDescribed(client);
  const active = [
    { id: "demo", plugin: "fixture", path: "/home/root/demo", state: "active" },
  ];
  expect(JSON.parse(await client.exec("plugins status"))).toEqual({
    configured: true,
    changes: [],
    active,
  });
  expect(JSON.parse(await client.exec("plugins plan"))).toEqual([]);
  expect(JSON.parse(await client.exec("plugins apply"))).toEqual([]);
  expect(await client.exec("cat demo/value.txt")).toBe("first");
  expect(JSON.parse(await client.exec("plugins plan"))).toEqual([]);
}

async function assertAgentPluginDescribed(client: YashClient) {
  const description = JSON.parse(await client.exec("plugins describe agent"));
  expect(description).toMatchObject([
    {
      name: "agent",
      actions: [
        {
          name: "send",
          pseudobinary:
            "agent send PERSONA [--context PATH] [--chat CHATID] MESSAGE",
        },
      ],
      exposures: [
        { name: "conversation", protocol: "http", status: "designed" },
      ],
    },
  ]);
}

async function assertReactsToConfigChanges(client: YashClient, config: string) {
  await writeFile(config, manifest("second"));
  expect(JSON.parse(await client.exec("plugins plan"))).toEqual([
    { id: "demo", action: "refresh" },
  ]);
  await client.exec("plugins apply");
  expect(await client.exec("cat demo/value.txt")).toBe("second");
  await writeFile(config, onlyManifest("keep"));
  expect(JSON.parse(await client.exec("plugins plan"))).toEqual([
    { id: "keep", action: "activate" },
  ]);
  const applied = JSON.parse(await client.exec("plugins apply --prune"));
  expect(applied).toEqual(
    expect.arrayContaining([
      { id: "demo", action: "unmount" },
      { id: "keep", action: "activate" },
    ]),
  );
  await expect(client.exec("cat demo/value.txt")).rejects.toThrow(
    "No such file",
  );
}

async function startedDesiredServer(prefix: string, value: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const config = join(directory, "mounts.yaml");
  await writeFile(config, manifest(value));
  const server = await YafsServer.start({
    dataDir: directory,
    configPath: config,
  });
  const client = await YashClient.connect(server.address());
  return { client, server, config };
}

test("plugins refresh forces republishing one plugin from desired config without a manifest path", async () => {
  const { client, server } = await startedDesiredServer(
    "yafs-desired-refresh-",
    "first",
  );
  await client.exec("plugins apply");
  expect(JSON.parse(await client.exec("plugins plan"))).toEqual([]);
  const refreshed = JSON.parse(await client.exec("plugins refresh demo"));
  expect(refreshed).toEqual({ id: "demo", action: "refresh" });
  expect(await client.exec("cat demo/value.txt")).toBe("first");
  await expect(client.exec("plugins refresh nope")).rejects.toThrow(
    "No desired mount",
  );
  await client.close();
  await server.close();
});

test("plugin deactivate is the sole surviving plugin (singular) lifecycle verb", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, manifest("hello"));
  expect(yafs.execute("mounts status").error?.message).toContain("use plugins");
  expect(yafs.exec("plugin deactivate demo")).toBe("demo deactivated");
});

test("a daemon does not discover desired configuration inside its data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-no-default-config-"));
  await writeFile(join(directory, "mounts.yaml"), manifest("ignored"));
  const server = await YafsServer.start({ dataDir: directory });
  const client = await YashClient.connect(server.address());
  expect(JSON.parse(await client.exec("plugins status"))).toEqual({
    configured: false,
    changes: [],
    active: [],
    remedy:
      "Restart yafsd with --config PATH or set YAFS_CONFIG, then run plugins apply.",
  });
  await client.close();
  await server.close();
});

function manifest(value: string) {
  return JSON.stringify({
    version: 1,
    plugins: [
      {
        id: "demo",
        path: "demo",
        plugin: "fixture",
        config: { files: { "value.txt": value } },
        capabilities: [],
      },
    ],
  });
}

function onlyManifest(id: string) {
  return JSON.stringify({
    version: 1,
    plugins: [
      {
        id,
        path: id,
        plugin: "fixture",
        config: { files: {} },
        capabilities: [],
      },
    ],
  });
}
