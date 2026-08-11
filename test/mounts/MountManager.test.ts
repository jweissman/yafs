import { expect, test } from "bun:test";

import { MountManager } from "../../src/mounts/MountManager";
import { NodeStore } from "../../src/vfs/NodeStore";

test("planUnmount rejects an unknown mount id", () => {
  const manager = new MountManager(new NodeStore());
  expect(() => manager.planUnmount("nope")).toThrow("No active mount: nope");
});

test("unmount rejects an unknown mount id", () => {
  const manager = new MountManager(new NodeStore());
  expect(() => manager.unmount("nope", "test")).toThrow(
    "No active mount: nope",
  );
});
