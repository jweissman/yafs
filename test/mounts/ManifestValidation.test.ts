import { expect, test } from "bun:test";

import { parseManifest } from "../../src/mounts/Manifest";

test("a manifest rejects an unsupported version and non-array declarations", () => {
  assertInvalid("{version: 2, mounts: []}", "Invalid manifest: expected");
  assertInvalid(
    "{version: 1, mounts: not-an-array}",
    "Invalid manifest: expected",
  );
});

test("a manifest names the position of a non-object mount entry, which has no id to report", () => {
  assertInvalid("{version: 1, mounts: [1]}", "Invalid mount at position 1");
});

test("a manifest rejects a mount id of --all, reserved by plugin deactivate --all", () => {
  assertInvalid(
    entry("id: demo", "id: --all"),
    'id must not be "--all" (reserved by plugin deactivate)',
  );
});

test("a manifest rejects a plugin with a bad id, path, or provider, naming the mount", () => {
  assertInvalid(
    entry("id: demo", "id: 1"),
    "Invalid mount at position 1: id must be a string",
  );
  assertInvalid(
    entry("path: fixture", "path: /absolute"),
    'Invalid mount "demo" (position 1): path must be a relative path',
  );
  assertInvalid(
    entry("provider: fixture", "provider: bogus"),
    'Invalid mount "demo" (position 1): unknown provider: "bogus"',
  );
});

test("a github mount with no path: defaults under /world/github/<owner>/<repo>", () => {
  const manifest =
    "{version: 1, mounts: [{id: review, provider: github, " +
    'config: {repository: acme/widget, query: "is:pr", max: 2}, ' +
    "capabilities: [network.github-api]}]}";
  const { manifest: parsed } = parseManifest(manifest);
  expect(parsed.mounts[0].path).toBe("/world/github/acme/widget");
});

test("an explicit path: still overrides the github default", () => {
  const manifest =
    "{version: 1, mounts: [{id: review, path: reviews, provider: github, " +
    'config: {repository: acme/widget, query: "is:pr", max: 2}, ' +
    "capabilities: [network.github-api]}]}";
  const { manifest: parsed } = parseManifest(manifest);
  expect(parsed.mounts[0].path).toBe("reviews");
});

test("a slack mount with no path: defaults under /world/slack/channels/<channel>", () => {
  const manifest =
    "{version: 1, mounts: [{id: updates, provider: slack, " +
    "config: {channel: C123}, " +
    "capabilities: [network.slack-api, secret.slack-token]}]}";
  const { manifest: parsed } = parseManifest(manifest);
  expect(parsed.mounts[0].path).toBe("/world/slack/channels/C123");
});

test("a fixture mount with no path: is rejected, since fixture has no default", () => {
  const manifest =
    "{version: 1, mounts: [{id: demo, provider: fixture, " +
    "config: {files: {}}, capabilities: []}]}";
  assertInvalid(
    manifest,
    "fixture mounts have no default path for this config — path: is required",
  );
});

test("a manifest rejects non-array or non-string capabilities", () => {
  assertInvalid(
    entry("[]", "not-an-array"),
    "capabilities must be an array of strings",
  );
  assertInvalid(entry("[]", "[1]"), "capabilities must be an array of strings");
});

test("a manifest rejects a malformed refresh interval", () => {
  assertInvalid(refreshed("5"), "Invalid refresh interval");
  assertInvalid(refreshed("5days"), "Invalid refresh interval");
});

test("a mount entry cannot declare both plugin and provider", () => {
  const manifest = baseManifest().replace(
    "provider: fixture",
    "plugin: fixture, provider: fixture",
  );
  assertInvalid(manifest, "Use plugin, not both plugin and provider");
});

test("a fixture manifest rejects an invalid stream path, chunks, or interval", () => {
  assertInvalid(
    streamed('"/absolute": {chunks: ["a"], intervalMs: 10}'),
    "Invalid fixture stream path",
  );
  assertInvalid(
    streamed('"a.txt": {chunks: [1], intervalMs: 10}'),
    "Invalid fixture stream chunks",
  );
  assertInvalid(
    streamed('"a.txt": {chunks: ["a"], intervalMs: 0}'),
    "Invalid fixture stream interval",
  );
});

test("a fixture manifest rejects a non-relative file path or non-string content", () => {
  assertInvalid(filed('"/absolute": "content"'), "Invalid fixture files");
  assertInvalid(filed('"a.txt": 1'), "Invalid fixture files");
});

function streamed(entry: string) {
  return baseManifest().replace("files: {}", `files: {}, streams: {${entry}}`);
}

function filed(entry: string) {
  return baseManifest().replace("files: {}", `files: {${entry}}`);
}

function assertInvalid(manifest: string, message: string) {
  expect(() => parseManifest(manifest)).toThrow(message);
}

function entry(needle: string, replacement: string) {
  return baseManifest().replace(needle, replacement);
}

function refreshed(interval: string) {
  return baseManifest().replace(
    "capabilities: []",
    `capabilities: [], refresh: {interval: ${interval}}`,
  );
}

function baseManifest() {
  return (
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, " +
    "config: {files: {}}, capabilities: []}]}"
  );
}
