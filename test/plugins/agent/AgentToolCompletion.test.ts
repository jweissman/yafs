import { expect, test } from "bun:test";

import { systemPromptFor } from "../../../src/plugins/agent/AgentToolCompletion";

// Regression test for a real live failure: a tool-enabled persona asked to
// triage a PR queue it had real read/list access to replied "I haven't
// pulled the list of open PRs yet... give me the PR URLs" instead of just
// looking — the model had tools but no idea what path to point them at.
// `tools.roots` was always known to yafs; it just never reached the model.
test("systemPromptFor appends the persona's tool roots as a starting-point hint", () => {
  const call = callWith({
    prompt: "You are a terse reviewer.",
    tools: { roots: ["/home/root/reviews/pulls"] },
  });
  const prompt = systemPromptFor(call);
  expect(prompt).toContain("You are a terse reviewer.");
  expect(prompt).toContain("/home/root/reviews/pulls");
  expect(prompt).toContain("yafs.start_here");
  expect(prompt).toContain("yafs.tree or yafs.find");
  expect(prompt).toContain("Look up available context before asking the user");
  expect(prompt).toContain("resourceShape links");
});

test("systemPromptFor lists every configured root", () => {
  const call = callWith({
    prompt: "hi",
    tools: { roots: ["/home/root/a", "/home/root/b"] },
  });
  const prompt = systemPromptFor(call);
  expect(prompt).toContain("/home/root/a, /home/root/b");
});

test("systemPromptFor leaves the prompt untouched when there are no roots", () => {
  const call = callWith({ prompt: "You are a terse reviewer." });
  expect(systemPromptFor(call)).toBe("You are a terse reviewer.");
});

function callWith(persona: { prompt: string; tools?: { roots: string[] } }) {
  return {
    target: { config: { personas: {} }, persona },
    context: { mountId: "agents", personaName: "reviewer" },
  } as Parameters<typeof systemPromptFor>[0];
}
