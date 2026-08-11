import { expect, test } from "bun:test";

import { parseManifest } from "../../src/mounts/Manifest";

test("a manifest rejects an unsupported version and non-array declarations", () => {
  assertInvalid("{version: 2, mounts: []}", "Invalid .yafsmeta manifest");
  assertInvalid(
    "{version: 1, mounts: not-an-array}",
    "Invalid .yafsmeta manifest",
  );
});

test("a manifest rejects a plugin with a bad id, path, or provider", () => {
  assertInvalid(entry("id: demo", "id: 1"), "Invalid .yafsmeta plugin");
  assertInvalid(
    entry("path: fixture", "path: /absolute"),
    "Invalid .yafsmeta plugin",
  );
  assertInvalid(
    entry("provider: fixture", "provider: bogus"),
    "Invalid .yafsmeta plugin",
  );
});

test("a manifest rejects non-array or non-string capabilities", () => {
  assertInvalid(entry("[]", "not-an-array"), "Invalid .yafsmeta capabilities");
  assertInvalid(entry("[]", "[1]"), "Invalid .yafsmeta capabilities");
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
