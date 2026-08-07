import { expect, test } from "bun:test";

import Yafs from "../src";

test("plugin lifecycle commands require their expected arguments", () => {
  const yafs = new Yafs();
  expect(yafs.execute("plugin activate").stderr).toBe(
    "plugin requires a manifest path",
  );
  expect(yafs.execute("plugin refresh").stderr).toBe(
    "plugin refresh requires a manifest path",
  );
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
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/.yafsmeta",
    "{version: 1, plugins: [], mounts: []}",
  );
  expect(yafs.execute("plugin validate .yafsmeta").stderr).toBe(
    "Use plugins, not both plugins and mounts",
  );
});
