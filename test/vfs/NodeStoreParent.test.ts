import { expect, test } from "bun:test";

import Yafs from "../../src";

test("creating a symlink inside a union-mounted directory is rejected", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir lower");
  yafs.exec("mkdir upper");
  yafs.exec("union workspace upper lower");
  expect(() => yafs.exec("ln -s upper workspace/newlink")).toThrow(
    "Read-only union mount",
  );
});
