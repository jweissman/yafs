import { expect, test } from "bun:test";

import { pluginByName } from "../../src/mounts/ManifestMountPath";

test("pluginByName rejects a name outside the registered provider kinds", () => {
  expect(() => pluginByName("bogus")).toThrow("Unknown provider: bogus");
});
