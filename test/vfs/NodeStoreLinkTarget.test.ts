import { expect, test } from "bun:test";

import { FSNode } from "../../src/vfs/FSNode";
import { linkTarget } from "../../src/vfs/NodeStoreLinkTarget";

test("linkTarget rejects malformed symlink nodes", () => {
  expect(() => linkTarget(node(), node(), () => "/home/root")).toThrow(
    "Invalid symlink without target",
  );
});

function node(): FSNode {
  return { name: "link", createdAt: new Date(0), modifiedAt: new Date(0) };
}
