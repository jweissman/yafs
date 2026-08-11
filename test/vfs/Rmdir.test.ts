import { expect, test } from "bun:test";

import Yafs from "../../src";
import { activateDesired } from "../desired_mount_helpers";

test("rmdir removes an empty directory but refuses a non-empty one, a file, or a read-only mount", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir empty");
  yafs.exec("mkdir full");
  yafs.exec("touch full/inside");
  expect(yafs.exec("rmdir empty")).toBe("");
  expect(yafs.execute("cat empty").error?.code).toBe("not_found");
  expect(yafs.execute("rmdir full").error?.code).toBe("not_empty");
  expect(yafs.execute("rmdir full/inside").error?.code).toBe("not_directory");
  expect(yafs.execute("rmdir missing").error?.code).toBe("not_found");
  await activateDesired(yafs, fixtureManifest());
  expect(yafs.execute("rmdir fixture").error?.code).toBe("read_only_mount");
});

function fixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}
