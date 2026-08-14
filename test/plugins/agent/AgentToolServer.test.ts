import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import Yafs from "../../../src";
import { AgentToolServer } from "../../../src/plugins/agent/AgentToolServer";
import { activateDesired } from "../../desired_mount_helpers";
import { manifest, textOf, toolServer } from "./agent_tool_server_helpers";

test("a real MCP client can list and call tools through a live persona's scoped server", async () => {
  const yafs = new Yafs();
  await yafs.exec("mkdir work");
  await yafs.exec("echo hi > work/note.md");
  await activateDesired(yafs, manifest(["/home/root/work"]), "agents");
  const server = toolServer(yafs);
  server.start(0);
  expect(server.port()).toBeGreaterThan(0);

  const client = await connectedClient(server, "agents", "reviewer");
  const tools = await client.listTools();
  expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
    "yafs.diff",
    "yafs.find",
    "yafs.grep",
    "yafs.inspect",
    "yafs.list",
    "yafs.read",
    "yafs.test",
    "yafs.tree",
  ]);

  const result = await client.callTool({
    name: "yafs.read",
    arguments: { path: "/home/root/work/note.md" },
  });
  expect(textOf(result)).toBe("hi");

  await client.close();
  server.close();
});

test("closing the server tears down any still-open sessions", async () => {
  const yafs = new Yafs();
  await yafs.exec("mkdir work");
  await activateDesired(yafs, manifest(["/home/root/work"]), "agents");
  const server = toolServer(yafs);
  server.start(0);

  const client = await connectedClient(server, "agents", "reviewer");
  await client.listTools();
  server.close();
});

test("a real MCP client is rejected reading outside the persona's root", async () => {
  const yafs = new Yafs();
  await yafs.exec("mkdir work");
  await yafs.exec("mkdir secret");
  await activateDesired(yafs, manifest(["/home/root/work"]), "agents");
  const server = toolServer(yafs);
  server.start(0);

  const client = await connectedClient(server, "agents", "reviewer");
  const result = await client.callTool({
    name: "yafs.list",
    arguments: { path: "/home/root/secret" },
  });
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("Path outside allowed roots");

  await client.close();
  server.close();
});

test("a real MCP client is rejected calling a tool outside the bounded set", async () => {
  const yafs = new Yafs();
  await yafs.exec("mkdir work");
  await activateDesired(yafs, manifest(["/home/root/work"]), "agents");
  const server = toolServer(yafs);
  server.start(0);

  const client = await connectedClient(server, "agents", "reviewer");
  const result = await client.callTool({
    name: "yafs.query",
    arguments: { command: "cat /home/root/work" },
  });
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("Tool not permitted: yafs.query");

  await client.close();
  server.close();
});

test("the call budget persists across multiple tool calls in the same session", async () => {
  const yafs = new Yafs();
  await yafs.exec("mkdir work");
  await activateDesired(yafs, manifest(["/home/root/work"], 1), "agents");
  const server = toolServer(yafs);
  server.start(0);

  const client = await connectedClient(server, "agents", "reviewer");
  const args = { path: "/home/root/work" };
  const first = await client.callTool({ name: "yafs.list", arguments: args });
  expect(first.isError).toBeFalsy();
  const second = await client.callTool({ name: "yafs.list", arguments: args });
  expect(second.isError).toBe(true);
  expect(textOf(second)).toContain("Tool call budget exceeded");

  await client.close();
  server.close();
});

async function connectedClient(
  server: AgentToolServer,
  mountId: string,
  personaName: string,
) {
  const url = new URL(server.urlFor(mountId, personaName));
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
