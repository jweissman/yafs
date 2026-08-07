import { expect, test } from "bun:test";

import Yafs from "../src";

test("a manifest rejects an unsupported version and non-array declarations", () => {
  const yafs = new Yafs();
  assertInvalid(yafs, "{version: 2, mounts: []}", "Invalid .yafsmeta manifest");
  assertInvalid(
    yafs,
    "{version: 1, mounts: not-an-array}",
    "Invalid .yafsmeta manifest",
  );
});

test("a manifest rejects a plugin with a bad id, path, or provider", () => {
  const yafs = new Yafs();
  assertInvalid(yafs, entry("id: demo", "id: 1"), "Invalid .yafsmeta plugin");
  assertInvalid(
    yafs,
    entry("path: fixture", "path: /absolute"),
    "Invalid .yafsmeta plugin",
  );
  assertInvalid(
    yafs,
    entry("provider: fixture", "provider: bogus"),
    "Invalid .yafsmeta plugin",
  );
});

test("a manifest rejects non-array or non-string capabilities", () => {
  const yafs = new Yafs();
  assertInvalid(
    yafs,
    entry("[]", "not-an-array"),
    "Invalid .yafsmeta capabilities",
  );
  assertInvalid(yafs, entry("[]", "[1]"), "Invalid .yafsmeta capabilities");
});

test("a manifest rejects a malformed refresh interval", () => {
  const yafs = new Yafs();
  assertInvalid(yafs, refreshed("5"), "Invalid refresh interval");
  assertInvalid(yafs, refreshed("5days"), "Invalid refresh interval");
});

test("a mount entry cannot declare both plugin and provider", () => {
  const yafs = new Yafs();
  const manifest = baseManifest().replace(
    "provider: fixture",
    "plugin: fixture, provider: fixture",
  );
  assertInvalid(yafs, manifest, "Use plugin, not both plugin and provider");
});

test("a fixture manifest rejects an invalid stream path, chunks, or interval", () => {
  const yafs = new Yafs();
  assertInvalid(
    yafs,
    streamed('"/absolute": {chunks: ["a"], intervalMs: 10}'),
    "Invalid fixture stream path",
  );
  assertInvalid(
    yafs,
    streamed('"a.txt": {chunks: [1], intervalMs: 10}'),
    "Invalid fixture stream chunks",
  );
  assertInvalid(
    yafs,
    streamed('"a.txt": {chunks: ["a"], intervalMs: 0}'),
    "Invalid fixture stream interval",
  );
});

function streamed(entry: string) {
  return baseManifest().replace("files: {}", `files: {}, streams: {${entry}}`);
}

function assertInvalid(yafs: Yafs, manifest: string, message: string) {
  yafs.store.write("/home/root/.yafsmeta", manifest);
  expect(yafs.execute("plugin validate .yafsmeta").stderr).toBe(message);
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
