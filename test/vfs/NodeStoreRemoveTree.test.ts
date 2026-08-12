import { expect, test } from "bun:test";

import { NodeStore } from "../../src/vfs/NodeStore";

test("removeTree is a no-op when the target was never created", () => {
  const store = new NodeStore();
  store.mkdir("/home/root/existing");
  expect(() => store.removeTree("/home/root/missing")).not.toThrow();
  expect(store.list("/home/root")).toEqual(["existing"]);
});
