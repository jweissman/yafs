import { expect, test } from "bun:test";

import Yafs from "../../src";
import { MountManager } from "../../src/mounts/MountManager";
import { NodeStore } from "../../src/vfs/NodeStore";
import { activateDesired } from "../desired_mount_helpers";

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

test("activateDesired rejects an id with no matching declared mount", async () => {
  const yafs = new Yafs();
  const manifest =
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, " +
    "config: {files: {hello.txt: hi}}, capabilities: []}]}";
  await expect(activateDesired(yafs, manifest, "nope")).rejects.toThrow(
    "No declared mount: nope",
  );
});

test("planDesired rejects a manifest that changes an active mount's path", async () => {
  const yafs = new Yafs();
  const original =
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, " +
    "config: {files: {hello.txt: hi}}, capabilities: []}]}";
  const moved =
    "{version: 1, mounts: [{id: demo, path: moved, provider: fixture, " +
    "config: {files: {hello.txt: hi}}, capabilities: []}]}";
  await activateDesired(yafs, original);
  await expect(activateDesired(yafs, moved)).rejects.toThrow(
    "Desired mount path changed: demo",
  );
});
