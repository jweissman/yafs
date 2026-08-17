import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import Yafs from "../../src";
import { GitHubCollectionSource } from "../../src/plugins/github/GitHubCollectionSource";
import { SlackCollectionSource } from "../../src/plugins/slack/SlackCollectionSource";
import { MountManager } from "../../src/mounts/MountManager";
import { ProviderRegistry } from "../../src/mounts/ProviderRegistry";
import { NodeStore } from "../../src/vfs/NodeStore";
import { activateDesired } from "../desired_mount_helpers";
import { fakeClient, fakeState } from "./slack_inbound_fakes";
import { parseJson } from "../json";
import {
  connectedClient,
  textOf,
  toolServer,
} from "../plugins/agent/agent_tool_server_helpers";

// Closes the gap a reviewer flagged: earlier tests proved /world default
// pathing parses correctly and proved a tool-enabled persona can drive a
// tool loop, but never together — a persona scoped to a pathless GitHub
// mount's *default* /world path, discovering and reading real published
// content through start_here/tree/read, exactly the "no repo context"
// failure this whole effort was motivated by.
test("a persona scoped to a pathless GitHub mount's default /world path discovers and reads real content via MCP", async () => {
  const yafs = configuredYafs();
  await activateDesired(yafs, manifest(), "acme-widget");
  await activateDesired(yafs, manifest(), "updates");
  await activateDesired(yafs, manifest(), "agents");

  assertGithubPublishedUnderWorld(yafs);
  assertSlackPublishedUnderWorld(yafs);

  const server = toolServer(yafs);
  server.start(0);
  const client = await connectedClient(server, "agents", "reviewer");

  await assertStartHere(client);
  await assertTree(client);
  await assertRead(client);

  await client.close();
  server.close();
});

const WORLD_ROOT = "/world/github/acme/widget";

async function assertStartHere(client: Client) {
  const startHere = startHereResponse(
    textOf(await client.callTool({ name: "yafs.start_here", arguments: {} })) ??
      "{}",
  );
  expect(startHere.roots).toEqual([WORLD_ROOT]);
  expect(startHere.rootMounts).toEqual([
    { root: WORLD_ROOT, mount: WORLD_ROOT, provider: "github" },
  ]);
  // Three mounts are active (github, slack, agents) but this persona is
  // scoped to the github root alone — the other two must not leak into an
  // orientation response it receives over MCP.
  expect(startHere.mounts).toHaveLength(1);
  expect(startHere.mounts.at(0)).toMatchObject({
    path: WORLD_ROOT,
    provider: "github",
  });
  expect(startHere.mounts.at(0)?.resourceShape).toContain(
    "https://github.com/<owner>/<repo>/pull/<number>",
  );
}

async function assertTree(client: Client) {
  const tree = treeResponse(
    textOf(
      await client.callTool({
        name: "yafs.tree",
        arguments: { path: WORLD_ROOT },
      }),
    ) ?? "{}",
  );
  expect(tree.entries.map((entry) => entry.path)).toContain(
    `${WORLD_ROOT}/pulls/42/diff.patch`,
  );
}

async function assertRead(client: Client) {
  const read = await client.callTool({
    name: "yafs.read",
    arguments: { path: `${WORLD_ROOT}/pulls/42/diff.patch` },
  });
  expect(textOf(read)).toBe("diff --git");
}

function assertGithubPublishedUnderWorld(yafs: Yafs) {
  expect(yafs.exec("cat /world/github/acme/widget/pulls/42/diff.patch")).toBe(
    "diff --git",
  );
}

function assertSlackPublishedUnderWorld(yafs: Yafs) {
  const lines = yafs
    .exec("cat /world/slack/channels/C123/messages.ndjson")
    .split("\n")
    .map(parseJson);
  expect(lines).toEqual([{ user: "U1", text: "hello", ts: "1.0" }]);
}

function configuredYafs() {
  const store = new NodeStore();
  const providers = new ProviderRegistry(
    new GitHubCollectionSource({ pulls: async () => [pull()] }),
    undefined,
    new SlackCollectionSource(
      fakeClient(fakeState([{ user: "U1", text: "hello", ts: "1.0" }])),
    ),
  );
  return new Yafs({ store, mounts: new MountManager(store, { providers }) });
}

function pull() {
  return {
    number: 42,
    title: "Review",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
  };
}

function manifest() {
  const github =
    "{id: acme-widget, provider: github, " +
    'config: {repository: acme/widget, query: "is:open", max: 2}, ' +
    "capabilities: [network.github-api]}";
  const slack =
    "{id: updates, provider: slack, config: {channel: C123, max: 10}, " +
    "capabilities: [network.slack-api, secret.slack-token]}";
  const agent =
    "{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a reviewer.", ' +
    'tools: {roots: ["/world/github/acme/widget"]}}}}, ' +
    "capabilities: [chat.completion]}";
  return `{version: 1, mounts: [${github}, ${slack}, ${agent}]}`;
}

interface StartHereResponse {
  roots: string[];
  rootMounts: { root: string; mount: string; provider: string }[];
  mounts: { path: string; provider: string; resourceShape: string }[];
}

function startHereResponse(source: string): StartHereResponse {
  const value = parseJson(source);
  if (!isStartHereResponse(value)) {
    throw new Error("Expected start_here response");
  }
  return value;
}

function isStartHereResponse(value: unknown): value is StartHereResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Array.isArray(value.roots) &&
    Array.isArray(value.rootMounts) &&
    Array.isArray(value.mounts)
  );
}

function treeResponse(source: string): { entries: { path: string }[] } {
  const value = parseJson(source);
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error("Expected tree response");
  }
  return { entries: value.entries.filter(hasPath) };
}

function hasPath(value: unknown): value is { path: string } {
  return isRecord(value) && typeof value.path === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
