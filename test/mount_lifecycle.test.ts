import { expect, test } from "bun:test";

import Yafs from "../src";

test("mount lifecycle commands require their expected arguments", () => {
  const yafs = new Yafs();
  expect(yafs.execute("mount activate").stderr).toBe(
    "mount requires a manifest path",
  );
  expect(yafs.execute("mount refresh").stderr).toBe(
    "mount refresh requires a manifest path",
  );
  expect(yafs.execute("mount unmount").stderr).toBe(
    "mount unmount requires an id",
  );
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
  expect(yafs.execute("mount validate .yafsmeta").stderr).toBe(
    "Use plugins, not both plugins and mounts",
  );
});
