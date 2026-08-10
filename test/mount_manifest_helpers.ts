import { expect } from "bun:test";

import { parseManifest } from "../src/mounts/Manifest";

export function fixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}

export function auditSequences(source: string) {
  return source
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).sequence);
}

export function invalidManifests() {
  return [
    "{version: 1, version: 1, mounts: []}",
    "!custom {version: 1, mounts: []}",
    "{version: 1, mounts: *declared}",
    "{version: 1, mounts: &declared []}",
  ];
}

export function expectInvalidManifest(manifest: string) {
  expect(() => parseManifest(manifest)).toThrow("Invalid .yafsmeta YAML");
}
