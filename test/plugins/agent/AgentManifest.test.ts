import { expect, test } from "bun:test";

import { parseManifest } from "../../../src/mounts/Manifest";

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

test("a persona accepts tools.roots and optional budget overrides", () => {
  const manifest = personas(
    '{reviewer: {prompt: "hi", tools: {roots: ["/home/root/traces/pr"], ' +
      "maxResultBytes: 500, maxCalls: 3, deadlineMs: 1000}}}",
  );
  const { manifest: parsed } = parseManifest(manifest);
  const persona = parsed.mounts[0].config as unknown as {
    personas: { reviewer: { tools?: Record<string, unknown> } };
  };
  expect(persona.personas.reviewer.tools).toEqual({
    roots: ["/home/root/traces/pr"],
    maxResultBytes: 500,
    maxCalls: 3,
    deadlineMs: 1000,
  });
});

test("a persona accepts tools.roots alone, budgets undefined", () => {
  const manifest = personas(
    '{reviewer: {prompt: "hi", tools: {roots: ["/home/root/traces/pr"]}}}',
  );
  const { manifest: parsed } = parseManifest(manifest);
  const persona = parsed.mounts[0].config as unknown as {
    personas: { reviewer: { tools?: Record<string, unknown> } };
  };
  expect(persona.personas.reviewer.tools).toEqual({
    roots: ["/home/root/traces/pr"],
    maxResultBytes: undefined,
    maxCalls: undefined,
    deadlineMs: undefined,
  });
});

test("a persona rejects an empty, missing, or malformed tools config", () => {
  assertRejected(
    personas('{reviewer: {prompt: "hi", tools: {}}}'),
    "Invalid persona tools roots: at least one required",
  );
  assertRejected(
    personas('{reviewer: {prompt: "hi", tools: {roots: []}}}'),
    "Invalid persona tools roots: at least one required",
  );
  assertRejected(
    personas('{reviewer: {prompt: "hi", tools: {roots: ["relative"]}}}'),
    "Invalid persona tools root: must be an absolute path",
  );
  assertRejected(
    personas(
      '{reviewer: {prompt: "hi", tools: {roots: ["/home/root"], maxCalls: -1}}}',
    ),
    "Invalid maxCalls",
  );

  assertRejected(
    personas(
      '{reviewer: {prompt: "hi", tools: {roots: ["/home/root"], maxCalls: .nan}}}',
    ),
    "Invalid maxCalls",
  );
  assertRejected(
    personas('{reviewer: {prompt: "hi", tools: {extra: 1}}}'),
    "Unknown persona tools field",
  );
});

test("a persona rejects a non-string endpoint or model", () => {
  assertRejected(
    personas('{reviewer: {prompt: "hi", endpoint: 5}}'),
    "Invalid endpoint",
  );
  assertRejected(
    personas('{reviewer: {prompt: "hi", model: 5}}'),
    "Invalid model",
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
