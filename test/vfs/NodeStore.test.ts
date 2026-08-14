import { expect, test } from "bun:test";

import Yafs from "../../src";

test("NodeStore.origins exposes the same origin paths as its provenance records", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir notes");
  yafs.exec("touch notes/a.md");
  expect(yafs.store.origins("/home/root/notes/a.md")).toEqual(
    yafs.store.provenance("/home/root/notes/a.md").map((origin) => origin.path),
  );
});
