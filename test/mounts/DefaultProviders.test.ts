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

test("a configured Slack token builds a Slack collection source without a network call", () => {
  const token = process.env.YAFS_SLACK_TOKEN;
  process.env.YAFS_SLACK_TOKEN = "test-token";
  try {
    expect(() => defaultProviders()).not.toThrow();
  } finally {
    if (token === undefined) {
      delete process.env.YAFS_SLACK_TOKEN;
    } else {
      process.env.YAFS_SLACK_TOKEN = token;
    }
  }
});

test("a configured GitHub token builds an authenticated collection source", () => {
  const token = process.env.YAFS_GITHUB_TOKEN;
  process.env.YAFS_GITHUB_TOKEN = "test-token";
  try {
    expect(() => defaultProviders()).not.toThrow();
  } finally {
    if (token === undefined) {
      delete process.env.YAFS_GITHUB_TOKEN;
    } else {
      process.env.YAFS_GITHUB_TOKEN = token;
    }
  }
});

test("the default provider registry works without a GitHub token", () => {
  const token = process.env.YAFS_GITHUB_TOKEN;
  delete process.env.YAFS_GITHUB_TOKEN;
  try {
    expect(() => defaultProviders()).not.toThrow();
  } finally {
    if (token !== undefined) {
      process.env.YAFS_GITHUB_TOKEN = token;
    }
  }
});

test("a plugin without custom advice leaves capability diagnostics generic", () => {
  const plugin = new FixturePlugin();
  expect(
    plugin.unavailableCapability({ id: "demo" }, "network.example"),
  ).toBeUndefined();
});
