import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../../../src";
import { AgentToolMcpSync } from "../../../src/plugins/agent/AgentToolMcpSync";
import { yafsKey } from "../../../src/plugins/agent/LmStudioMcpJson";
import { activateDesired } from "../../desired_mount_helpers";
import { parseJson } from "../../json";

const URL_FOR = (mountId: string, personaName: string) =>
  `http://127.0.0.1:7338/mcp/${mountId}/${personaName}`;
const REVIEWER_KEY = yafsKey("agents", "reviewer");

test("close() is a no-op (satisfies the PluginDriver interface)", async () => {
  const yafs = await toolPersonaYafs();
  new AgentToolMcpSync(yafs.mounts, URL_FOR).close();
});

test("sync() does nothing when no path is given", async () => {
  const yafs = await toolPersonaYafs();
  const sync = new AgentToolMcpSync(yafs.mounts, URL_FOR);
  sync.sync();
  await flush();
  // no assertion needed beyond "this didn't throw and touched nothing" —
  // there is no path to check by design.
});

test("sync() writes an entry for each tool-enabled persona", async () => {
  const path = await mcpJsonPath();
  const yafs = await toolPersonaYafs();
  new AgentToolMcpSync(yafs.mounts, URL_FOR, path).sync();
  await flush();
  expect(await readJson(path)).toEqual({
    mcpServers: {
      [REVIEWER_KEY]: {
        url: "http://127.0.0.1:7338/mcp/agents/reviewer",
      },
    },
  });
});

test("sync() skips a persona with no tools: configured and writes nothing", async () => {
  const path = await mcpJsonPath();
  const yafs = new Yafs();
  await activateDesired(yafs, manifest(false), "agents");
  new AgentToolMcpSync(yafs.mounts, URL_FOR, path).sync();
  await flush();
  // Nothing to sync against an empty desired set — no-op, not an empty
  // write; the file should never have been created.
  await expect(readFile(path, "utf8")).rejects.toThrow();
});

test("sync() preserves entries it doesn't own and removes stale yafs entries", async () => {
  const path = await mcpJsonPath();
  const staleKey = yafsKey("agents", "old");
  await writeFile(
    path,
    JSON.stringify({
      mcpServers: {
        "mcp/playwright": { command: "npx" },
        [staleKey]: { url: "http://stale" },
      },
    }),
  );
  const yafs = await toolPersonaYafs();
  new AgentToolMcpSync(yafs.mounts, URL_FOR, path).sync();
  await flush();
  expect(await readJson(path)).toEqual({
    mcpServers: {
      "mcp/playwright": { command: "npx" },
      [REVIEWER_KEY]: {
        url: "http://127.0.0.1:7338/mcp/agents/reviewer",
      },
    },
  });
});

test("sync() leaves an unparsable file alone and logs instead of guessing", async () => {
  const path = await mcpJsonPath();
  await writeFile(path, "{ not valid json");
  const errors = await capturedErrors(async () => {
    const yafs = await toolPersonaYafs();
    new AgentToolMcpSync(yafs.mounts, URL_FOR, path).sync();
    await flush();
  });
  expect(await readFile(path, "utf8")).toBe("{ not valid json");
  expect(errors.some((args) => String(args[0]).includes("mcp.json"))).toBe(
    true,
  );
});

async function toolPersonaYafs(): Promise<Yafs> {
  const yafs = new Yafs();
  await activateDesired(yafs, manifest(true), "agents");
  return yafs;
}

function manifest(withTools: boolean) {
  const tools = withTools ? ', tools: {roots: ["/home/root/agents"]}' : "";
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "hi"' +
    tools +
    "}}}, capabilities: [chat.completion]}]}"
  );
}

async function mcpJsonPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "yafs-mcpsync-"));
  return join(dir, "mcp.json");
}

async function readJson(path: string) {
  return parseJson(await readFile(path, "utf8"));
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function capturedErrors(run: () => Promise<void>) {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await run();
  } finally {
    console.error = original;
  }
  return errors;
}
