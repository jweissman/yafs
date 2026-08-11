import { expect, test } from "bun:test";

import { startedHostConfigServer } from "../desired_mount_helpers";

test("daemon startup fails clearly when the host config cannot reconcile", async () => {
  const manifest =
    "{version: 1, plugins: [{id: demo, path: demo, plugin: fixture, " +
    "config: {files: {}}, capabilities: [bogus]}]}";
  await expect(
    startedHostConfigServer("yafs-reconcile-fail-", manifest),
  ).rejects.toThrow("Capabilities are not granted");
});
