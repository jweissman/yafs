import { expect, test } from "bun:test";

import Yafs from "../src";
import { parseManifest } from "../src/mounts/Manifest";

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
    "plugin deactivate requires an id",
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
