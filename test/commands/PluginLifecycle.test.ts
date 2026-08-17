import { expect, test } from "bun:test";

import Yafs from "../../src";
import { parseManifest } from "../../src/mounts/Manifest";
import { activateDesired } from "../desired_mount_helpers";

const REJECTED =
  "plugin no longer accepts validate|activate|refresh; declare instances " +
  "in a host-side yafs.plugins.yaml and use `plugins apply` (see `plugins " +
  "describe`)";

test("plugin no longer accepts validate/activate/refresh, and deactivate still requires an id", () => {
  const yafs = new Yafs();
  expect(yafs.execute("plugin validate .yafsmeta").stderr).toBe(REJECTED);
  expect(yafs.execute("plugin activate .yafsmeta").stderr).toBe(REJECTED);
  expect(yafs.execute("plugin refresh .yafsmeta").stderr).toBe(REJECTED);
  expect(yafs.execute("plugin deactivate").stderr).toBe(
    "plugin deactivate requires an id, or --all",
  );
});

test("plugin deactivate --all deactivates every active mount, and a bare status confirms none remain", async () => {
  const yafs = new Yafs();
  const first =
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, " +
    "config: {files: {hello.txt: hi}}, capabilities: []}]}";
  const second =
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, " +
    "config: {files: {hello.txt: hi}}, capabilities: []}, " +
    "{id: other, path: other, provider: fixture, " +
    "config: {files: {}}, capabilities: []}]}";
  await activateDesired(yafs, first, "demo");
  await activateDesired(yafs, second, "other");
  expect(yafs.exec("plugin deactivate --all")).toBe(
    "2 deactivated: demo, other",
  );
  expect(yafs.mounts.mounts()).toEqual([]);
});

test("plugins describe rejects an unknown provider name", () => {
  const yafs = new Yafs();
  expect(yafs.execute("plugins describe bogus").stderr).toBe(
    "Unknown provider: bogus",
  );
});

test("mount is no longer a recognized command", () => {
  const yafs = new Yafs();
  const result = yafs.execute("mount activate");
  expect(result.stderr).toBe("Unknown command: mount");
  expect(result.error).toEqual({
    code: "unknown_command",
    message: "Unknown command: mount",
  });
});

test("plugins with no subcommand describes every plugin, and an unknown action is rejected", () => {
  const yafs = new Yafs();
  expect(JSON.parse(yafs.exec("plugins"))).toEqual(yafs.mounts.plugins());
  expect(yafs.execute("plugins bogus").stderr).toBe(
    "plugins expects describe, status, plan, apply [--prune], or refresh ID",
  );
});

test("a manifest cannot declare both plugins and mounts", () => {
  expect(() => parseManifest("{version: 1, plugins: [], mounts: []}")).toThrow(
    "Use plugins, not both plugins and mounts",
  );
});
