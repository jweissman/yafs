import { expect, test } from "bun:test";

import { defaultProviders } from "../../src/mounts/defaultProviders";
import { FixturePlugin } from "../../src/plugins/fixture/FixturePlugin";

test("the default provider registry tolerates a missing Slack token instead of throwing at startup", () => {
  const token = process.env.YAFS_SLACK_TOKEN;
  delete process.env.YAFS_SLACK_TOKEN;
  try {
    expect(() => defaultProviders()).not.toThrow();
  } finally {
    if (token !== undefined) {
      process.env.YAFS_SLACK_TOKEN = token;
    }
  }
});

test("a plugin without custom advice leaves capability diagnostics generic", () => {
  const plugin = new FixturePlugin();
  expect(
    plugin.unavailableCapability({ id: "demo" }, "network.example"),
  ).toBeUndefined();
});
