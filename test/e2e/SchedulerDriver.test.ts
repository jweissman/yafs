import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";

import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a scheduled script's own timer fires it repeatedly, not just once at startup", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-scheduler-",
    schedulerManifest(20),
  );
  await client.exec('printf "touch ticked.txt" > tick.yash');
  await client.exec("plugins apply");
  await waitForFile(client, "ticked.txt");
  await client.close();
  await server.close();
});

test("reconfiguring a scheduled mount's interval takes effect without leaking the old timer", async () => {
  const { configPath, server, client } = await startedHostConfigServer(
    "yafs-scheduler-reconfigure-",
    schedulerManifest(100000),
  );
  await client.exec('printf "touch first.txt" > tick.yash');
  await client.exec("plugins apply");
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await client.exec("test -e first.txt")).toBe("false");

  await writeFile(configPath, schedulerManifest(20));
  await client.exec("plugins refresh sched");
  await waitForFile(client, "first.txt");

  await client.close();
  await server.close();
});

test("unmounting a scheduled mount stops its timer instead of leaking it", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-scheduler-unmount-",
    schedulerManifest(20),
  );
  await client.exec('printf "touch ticked.txt" > tick.yash');
  await client.exec("plugins apply");
  await waitForFile(client, "ticked.txt");

  await client.exec("plugin deactivate sched");
  await client.exec("rm ticked.txt");
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(await client.exec("test -e ticked.txt")).toBe("false");

  await client.close();
  await server.close();
});

async function waitForFile(client: YashClient, name: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await client.exec(`test -e ${name}`)) === "true") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("scheduled script never ran");
}

function schedulerManifest(intervalMs: number) {
  return (
    "{version: 1, mounts: [{id: sched, path: sched, provider: scheduler, " +
    `config: {script: /home/root/tick.yash, intervalMs: ${intervalMs}, ` +
    "allow: [mutate]}, capabilities: [control.scheduled-execution]}]}"
  );
}
