import { expect, test } from "bun:test";

import Yafs from "../src";
import { activateDesired } from "./desired_mount_helpers";

test("mount planning rejects duplicate and overlapping active paths", async () => {
  const yafs = new Yafs();
  const manifest = multipleFixtureManifest();
  await activateDesired(yafs, manifest, "first");
  await expect(activateDesired(yafs, manifest, "second")).rejects.toThrow(
    "Overlapping mount: /home/root/fixture/nested",
  );
  await expect(activateDesired(yafs, manifest, "duplicate")).rejects.toThrow(
    "Mount path already exists: /home/root/fixture",
  );
});

function multipleFixtureManifest() {
  return "{version: 1, mounts: [{id: first, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}, {id: second, path: fixture/nested, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}, {id: duplicate, path: fixture, provider: fixture, config: {files: {again.txt: hello}}, capabilities: []}]}";
}
