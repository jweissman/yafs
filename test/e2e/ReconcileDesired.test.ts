import { expect, test } from "bun:test";

import { startedHostConfigServer } from "../desired_mount_helpers";
import { loggedEntries } from "../logging_helpers";

test("daemon startup logs a reconcile failure but still starts listening", async () => {
  const manifest =
    "{version: 1, plugins: [{id: demo, path: demo, plugin: fixture, " +
    "config: {files: {}}, capabilities: [bogus]}]}";
  const entries = await loggedEntries(async () => {
    const { server, client } = await startedHostConfigServer(
      "yafs-reconcile-fail-",
      manifest,
    );
    await client.close();
    await server.close();
  });
  expect(
    entries.some(
      (entry) =>
        entry.message === "startup reconcile failed" &&
        typeof entry.error === "string" &&
        entry.error.includes("Capabilities are not granted"),
    ),
  ).toBe(true);
});
