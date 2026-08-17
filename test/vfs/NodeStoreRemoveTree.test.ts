import { expect, test } from "bun:test";

import { NodeStore } from "../../src/vfs/NodeStore";
import { FSNode } from "../../src/vfs/FSNode";
import { removeTreeChild } from "../../src/vfs/NodeStoreRemove";

test("removeTree is a no-op when the target was never created", () => {
  const store = new NodeStore();
  store.mkdir("/home/root/existing");
  expect(() => {
    store.removeTree("/home/root/missing");
  }).not.toThrow();
  expect(store.list("/home/root")).toEqual(["existing"]);
});

test("removeTreeChild is a no-op for a non-directory node", () => {
  removeTreeChild(file(), "missing");
});

function file(): FSNode {
  return { name: "file", createdAt: new Date(0), modifiedAt: new Date(0) };
}
