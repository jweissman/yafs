import { expect, test } from "bun:test";

import { defaultProviders } from "../src/mounts/defaultProviders";

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
