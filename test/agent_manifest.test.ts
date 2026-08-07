import { expect, test } from "bun:test";

import Yafs from "../src";

test("an agent manifest rejects empty personas, invalid names, and invalid prompts", () => {
  const yafs = new Yafs();
  assertRejected(
    yafs,
    personas("{}"),
    "Invalid agent personas: at least one required",
  );
  assertRejected(
    yafs,
    personas('{"a/b": {prompt: "hi"}}'),
    "Invalid persona name",
  );
  assertRejected(
    yafs,
    personas('{reviewer: {prompt: ""}}'),
    "Invalid persona prompt",
  );
});

function assertRejected(yafs: Yafs, manifest: string, message: string) {
  yafs.store.write("/home/root/.yafsmeta", manifest);
  expect(yafs.execute("plugin validate .yafsmeta").stderr).toBe(message);
}

function personas(entries: string) {
  return (
    `{version: 1, mounts: [{id: reviewer, path: agents, provider: agent, ` +
    `config: {personas: ${entries}}, capabilities: []}]}`
  );
}
