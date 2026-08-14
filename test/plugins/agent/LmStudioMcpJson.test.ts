import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defaultMcpJsonPath,
  mergedDocument,
  readMcpJson,
  writeMcpJson,
  yafsKey,
} from "../../../src/plugins/agent/LmStudioMcpJson";

test("defaultMcpJsonPath points at ~/.lmstudio/mcp.json", () => {
  expect(defaultMcpJsonPath()).toMatch(/[/\\]\.lmstudio[/\\]mcp\.json$/);
});

test("yafsKey combines mountId and personaName so same-named personas on different mounts don't collide", () => {
  expect(yafsKey("agents", "reviewer")).toBe("yafs-agents-reviewer");
  expect(yafsKey("other", "reviewer")).toBe("yafs-other-reviewer");
});

test("readMcpJson treats a missing file as an empty document", async () => {
  const path = join(await tempDir(), "mcp.json");
  expect(await readMcpJson(path)).toEqual({ mcpServers: {} });
});

test("readMcpJson returns undefined for an existing but unparsable file, rather than guessing", async () => {
  const path = join(await tempDir(), "mcp.json");
  await writeFile(path, "{ not valid json");
  expect(await readMcpJson(path)).toBeUndefined();
});

test("readMcpJson tolerates a document with no mcpServers key or the wrong shape", async () => {
  const path = join(await tempDir(), "mcp.json");
  await writeFile(path, JSON.stringify({ someOtherField: true }));
  expect(await readMcpJson(path)).toEqual({
    someOtherField: true,
    mcpServers: {},
  });
});

test("mergedDocument keeps non-yafs entries untouched and replaces yafs entries wholesale", () => {
  const existing = {
    mcpServers: {
      "mcp/playwright": { command: "npx", args: ["playwright-mcp"] },
      "yafs-agents-old": { url: "http://127.0.0.1:7338/mcp/agents/old" },
    },
  };
  const desired = {
    "yafs-agents-reviewer": { url: "http://127.0.0.1:7338/mcp/agents/reviewer" },
  };
  expect(mergedDocument(existing, desired)).toEqual({
    mcpServers: {
      "mcp/playwright": { command: "npx", args: ["playwright-mcp"] },
      "yafs-agents-reviewer": {
        url: "http://127.0.0.1:7338/mcp/agents/reviewer",
      },
    },
  });
});

test("mergedDocument preserves other top-level document fields", () => {
  const existing = { mcpServers: {}, someFutureField: 42 };
  expect(mergedDocument(existing, {})).toEqual({
    mcpServers: {},
    someFutureField: 42,
  });
});

test("writeMcpJson creates missing parent directories and writes pretty JSON", async () => {
  const path = join(await tempDir(), "nested", "mcp.json");
  await writeMcpJson(path, {
    mcpServers: { "yafs-agents-reviewer": { url: "http://x" } },
  });
  const raw = await readFile(path, "utf8");
  expect(JSON.parse(raw)).toEqual({
    mcpServers: { "yafs-agents-reviewer": { url: "http://x" } },
  });
  expect(raw).toContain("\n");
});

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "yafs-mcpjson-"));
}
