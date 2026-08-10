import { expect, test } from "bun:test";

import { McpServer } from "../src/mcp/Server";
import { LocalYashClient } from "../src/protocol/local";

test("MCP capture and restore use the durable typed evidence operation", async () => {
  const client = new LocalYashClient();
  await client.exec("mkdir source");
  await client.exec("mkdir artifacts");
  await client.exec("echo captured > source/a.md");
  const server = new McpServer(client);
  expect(await call(server, 1, "yafs.capture", {
    source: "/home/root/source", artifact: "/home/root/artifacts/one",
  })).toContain('"kind":"capture"');
  await client.exec("echo current > source/a.md");
  expect(await call(server, 2, "yafs.restore", {
    artifact: "/home/root/artifacts/one", destination: "/home/root/restored",
  })).toContain('"kind":"restore"');
  expect(await client.exec("cat restored/a.md")).toBe("captured");
  await client.close();
});

async function call(
  server: McpServer, id: number, name: string, arguments_: object,
) {
  const response = await server.receive({
    jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: arguments_ },
  });
  const result = response?.result as { content: { text: string }[] };
  return result.content[0].text;
}
