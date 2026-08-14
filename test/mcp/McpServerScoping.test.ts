import { expect, test } from "bun:test";

import { McpServer } from "../../src/mcp/Server";
import { LocalYashClient } from "../../src/protocol/local";
import { request, toolText } from "./mcp_test_helpers";

test("an allowedTools filter narrows tools/list", async () => {
  const client = new LocalYashClient();
  const server = new McpServer(client, new Set(["yafs.list", "yafs.read"]));
  const response = await request(server, 1, "tools/list");
  const names = (response!.result as { tools: { name: string }[] }).tools.map(
    (tool) => tool.name,
  );
  expect(names).toEqual(["yafs.list", "yafs.read"]);
  await client.close();
});

test("an allowedTools filter rejects a call to a disallowed tool", async () => {
  const client = new LocalYashClient();
  const server = new McpServer(client, new Set(["yafs.list"]));
  const text = await toolText(server, 1, "yafs.query", { source: "echo hi" });
  expect(text).toContain("Tool not permitted: yafs.query");
  await client.close();
});

test("a permitted tool still works normally under the filter", async () => {
  const client = new LocalYashClient();
  const server = new McpServer(client, new Set(["yafs.list"]));
  const text = await toolText(server, 1, "yafs.list", {
    path: "/home/root",
  });
  expect(typeof text).toBe("string");
  await client.close();
});
