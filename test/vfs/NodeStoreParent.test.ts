import { expect, test } from "bun:test";

import Yafs from "../../src";

// `ln`/`union` create the new node's parent lookup via NodeStoreParent's
// own writability check directly, unlike write/mkdir/touch/remove which
// are pre-guarded by NodeStoreWritability before they ever reach it — so
// this is the only path that exercises NodeStoreParent's union-mount check.
test("creating a symlink inside a union-mounted directory is rejected", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir lower");
  yafs.exec("mkdir upper");
  yafs.exec("union workspace upper lower");
  expect(() => yafs.exec("ln -s upper workspace/newlink")).toThrow(
    "Read-only union mount",
  );
});
