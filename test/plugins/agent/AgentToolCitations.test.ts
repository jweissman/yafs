import { expect, test } from "bun:test";

import Yafs from "../../../src";
import { MountManager } from "../../../src/mounts/MountManager";
import { NodeStore } from "../../../src/vfs/NodeStore";
import { ProviderRegistry } from "../../../src/mounts/ProviderRegistry";
import { GitHubCollectionSource } from "../../../src/plugins/github/GitHubCollectionSource";
import { LmStudioTurn } from "../../../src/plugins/agent/LmStudioMcpClient";
import { citationsFooter } from "../../../src/plugins/agent/AgentToolCitations";
import { activateDesired } from "../../desired_mount_helpers";

// Regression coverage for a real live failure: a model's own final reply
// omitted the PR number and link entirely, even after prompt guidance
// asked for one. This proves the footer is built deterministically from
// the actual tool-call transcript instead, independent of what the model
// remembered to say.
test("citationsFooter cites the real PR link and title from read/inspect calls, deduped", async () => {
  const yafs = await configuredYafs();
  const turn: LmStudioTurn = {
    output: [
      {
        type: "tool_call",
        tool: "yafs.tree",
        arguments: { path: "/world/github/acme/widget/pulls" },
        output: "...",
      },
      {
        type: "tool_call",
        tool: "yafs.read",
        arguments: { path: "/world/github/acme/widget/pulls/42/diff.patch" },
        output: "...",
      },
      {
        type: "tool_call",
        tool: "yafs.inspect",
        arguments: { path: "/world/github/acme/widget/pulls/42/metadata.json" },
        output: "...",
      },
      { type: "message", content: "Safe to merge." },
    ],
  };
  expect(citationsFooter(yafs.mounts, turn, 4_000)).toBe(
    "\n\n---\n3 tool call(s) this turn, in 4s. Viewed:\n" +
      "- <https://github.com/acme/widget/pull/42|#42 Add widget polish>",
  );
});

// Regression coverage for a second real live failure: the receipt's own
// _..._ emphasis wrapper collided with an underscore inside a real PR
// title and visibly mangled the rendered text in Slack. Also covers the
// separate bug where [label](url) never rendered as a link in Slack at
// all, since Slack's mrkdwn uses <url|label>, not CommonMark syntax.
test("citationsFooter escapes a title's own markdown-significant characters", async () => {
  const yafs = await configuredYafs(
    "B_read/applicant_vets_letter <history> & logic | notes",
  );
  const turn: LmStudioTurn = {
    output: [
      {
        type: "tool_call",
        tool: "yafs.read",
        arguments: { path: "/world/github/acme/widget/pulls/42/diff.patch" },
        output: "...",
      },
    ],
  };
  expect(citationsFooter(yafs.mounts, turn, 1_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1s. Viewed:\n" +
      "- <https://github.com/acme/widget/pull/42|#42 B_read/applicant_vets_letter " +
      "&lt;history&gt; &amp; logic / notes>",
  );
});

// Regression coverage for a real live bug: citation links hardcoded
// github.com even when the daemon's actual repository lives on a GitHub
// Enterprise Cloud host (YAFS_GITHUB_HOST=<name>.ghe.com) -- the link
// pointed at the wrong site entirely. The web host, unlike the API host,
// is the bare configured host in every deployment shape (see
// GitHubSettings.ts), so it's threaded straight through instead of
// hardcoded.
test("citationsFooter links to the configured GitHub host, not a hardcoded github.com", async () => {
  const yafs = await configuredYafs("Add widget polish", "https://va.ghe.com");
  const turn: LmStudioTurn = {
    output: [
      {
        type: "tool_call",
        tool: "yafs.read",
        arguments: { path: "/world/github/acme/widget/pulls/42/diff.patch" },
        output: "...",
      },
    ],
  };
  expect(citationsFooter(yafs.mounts, turn, 1_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1s. Viewed:\n" +
      "- <https://va.ghe.com/acme/widget/pull/42|#42 Add widget polish>",
  );
});

test("citationsFooter reports elapsed time in minutes and seconds once it crosses a minute", () => {
  const mounts = new MountManager(new NodeStore());
  const turn: LmStudioTurn = {
    output: [
      { type: "tool_call", tool: "yafs.list", arguments: {}, output: "..." },
      { type: "message", content: "Done." },
    ],
  };
  expect(citationsFooter(mounts, turn, 65_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1m05s.",
  );
});

test("citationsFooter reports the call count with no Viewed list when nothing resolves", () => {
  const mounts = new MountManager(new NodeStore());
  const turn: LmStudioTurn = {
    output: [
      { type: "tool_call", tool: "yafs.list", arguments: {}, output: "..." },
      { type: "message", content: "Nothing found." },
    ],
  };
  expect(citationsFooter(mounts, turn, 1_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1s.",
  );
});

// Regression coverage for a real live bug: a resourceReference persisted
// before `url` was added to the shape (an unrefreshed mount snapshot from
// before this session's fix) rendered as a literal "<undefined|...>" link
// in Slack, because the field was interpolated unchecked. A reference
// missing a field this citation needs should be skipped, not rendered
// broken -- the mount's own refresh cycle will pick up the new shape.
test("citationsFooter skips a resourceReference missing a field added after it was persisted", () => {
  const staleMounts = {
    resourceReference: () => ({
      kind: "github-pr",
      repository: "acme/widget",
      number: 42,
      headSha: "abc123",
      title: "Old shape, persisted before url existed",
      // url intentionally absent.
    }),
  } as unknown as MountManager;
  const turn: LmStudioTurn = {
    output: [
      {
        type: "tool_call",
        tool: "yafs.read",
        arguments: { path: "/world/github/acme/widget/pulls/42/diff.patch" },
        output: "...",
      },
    ],
  };
  expect(citationsFooter(staleMounts, turn, 1_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1s.",
  );
});

// Regression coverage for a real live failure: asked to "review 29795
// carefully," a persona's own reasoning said "already did [read the
// diff]," made zero tool calls, and invented a specific, false claim
// ("a quick grep across the repo shows no remaining hard-coded
// instances") that couldn't have happened -- the mount holds one PR's
// diff/metadata, never a checked-out repo. An empty footer gave zero
// signal that nothing was freshly checked; this is the one case where
// the footer matters most, so it must never go silent.
test("citationsFooter explicitly warns when zero tools were called, rather than staying silent", () => {
  const mounts = new MountManager(new NodeStore());
  const turn: LmStudioTurn = { output: [{ type: "message", content: "Hi." }] };
  expect(citationsFooter(mounts, turn, 1_000)).toBe(
    "\n\n---\n0 tool calls this turn (1s) -- nothing above was freshly verified.",
  );
});

test("citationsFooter omits a read with no provider reference", () => {
  const mounts = new MountManager(new NodeStore());
  const turn: LmStudioTurn = {
    output: [
      {
        type: "tool_call",
        tool: "yafs.read",
        arguments: { path: "/unknown.txt" },
        output: "...",
      },
    ],
  };
  expect(citationsFooter(mounts, turn, 1_000)).toBe(
    "\n\n---\n1 tool call(s) this turn, in 1s.",
  );
});

async function configuredYafs(
  title = "Add widget polish",
  webUrl = "https://github.com",
) {
  const store = new NodeStore();
  const providers = new ProviderRegistry(
    new GitHubCollectionSource({ pulls: async () => [pull(title)] }, webUrl),
  );
  const mounts = new MountManager(store, { providers });
  const yafs = new Yafs({ store, mounts });
  await activateDesired(yafs, manifest());
  return yafs;
}

function pull(title: string) {
  return {
    number: 42,
    title,
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}

function manifest() {
  return (
    "{version: 1, mounts: [{id: review, provider: github, " +
    'config: {repository: acme/widget, query: "is:pr", max: 2}, ' +
    "capabilities: [network.github-api]}]}"
  );
}
