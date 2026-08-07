import { expect } from "bun:test";

import Yafs from "../src";

export function fixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}

export function nestedFixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {nested/hello.txt: hello}}, capabilities: []}]}";
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

export function expectInvalidManifest(yafs: Yafs, manifest: string) {
  yafs.store.write("/home/root/.yafsmeta", manifest);
  expect(yafs.execute("mount validate .yafsmeta").stderr).toBe(
    "Invalid .yafsmeta YAML",
  );
}
