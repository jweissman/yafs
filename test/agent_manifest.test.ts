import { expect, test } from "bun:test";

import { parseManifest } from "../src/mounts/Manifest";

test("an agent manifest rejects empty personas, invalid names, and invalid prompts", () => {
  assertRejected(
    personas("{}"),
    "Invalid agent personas: at least one required",
  );
  assertRejected(personas('{"a/b": {prompt: "hi"}}'), "Invalid persona name");
  assertRejected(
    personas('{reviewer: {prompt: ""}}'),
    "Invalid persona prompt",
  );
});

function assertRejected(manifest: string, message: string) {
  expect(() => parseManifest(manifest)).toThrow(message);
}

function personas(entries: string) {
  return (
    `{version: 1, mounts: [{id: reviewer, path: agents, provider: agent, ` +
    `config: {personas: ${entries}}, capabilities: []}]}`
  );
}
