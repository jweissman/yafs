import { expect, test } from "bun:test";

import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";
import { startedHostConfigServer } from "../desired_mount_helpers";

const SNAPSHOT_INTERVAL = 32;

// Reproduces a live bug: a mount's activation can predate the journal's
// last compacted snapshot while its later unmount postdates it. On the
// next restart, the snapshot restores the mount's stale content, and
// replay only reprocesses records after the snapshot -- which includes
// the unmount but not the original activation. Unmount handling used to
// look up the mount's path in the in-memory records array being rebuilt
// by *this* replay pass, which never regains an entry for a mount whose
// activation was never replayed -- silently skipping the removal.
test("an unmount survives restart even when a compaction predates it but postdates the mount's activation", async () => {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-replay-compact-",
    hostConfig(),
  );
  await client.exec("plugins apply");
  await forceCompaction(client);
  await client.exec("plugin deactivate demo");
  await client.close();
  await server.close();

  const restarted = await YafsServer.start({ dataDir: directory });
  const verified = await YashClient.connect(restarted.address());
  const result = await verified.execute("cat /home/root/demo/hello.txt");
  expect(result.error?.code).toBe("not_found");
  const inspected = await verified.execute("inspect /home/root/demo");
  expect(inspected.error?.code).toBe("not_found");
  await verified.close();
  await restarted.close();
});

async function forceCompaction(
  client: Awaited<ReturnType<typeof YashClient.connect>>,
) {
  for (let i = 0; i < SNAPSHOT_INTERVAL; i++) {
    await client.exec(`mkdir filler-${i}`);
  }
}

function hostConfig() {
  return "{version: 1, plugins: [{id: demo, path: demo, plugin: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}
