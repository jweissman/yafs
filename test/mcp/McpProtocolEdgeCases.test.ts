import { expect, test } from "bun:test";

import { McpServer } from "../../src/mcp/Server";
import { LocalYashClient } from "../../src/protocol/local";
import { request, toolText } from "./mcp_test_helpers";

test("MCP query stays read-only and reports protocol/argument errors", async () => {
  const client = new LocalYashClient();
  await client.exec("mkdir work");
  await client.exec("echo concise > work/brief.md");
  const server = new McpServer(client);
  await assertQueryIsReadOnly(server);
  await assertProtocolEdgeCases(server);
  await client.close();
});

async function assertQueryIsReadOnly(server: McpServer) {
  const query = (source: string) => ({ source });
  expect(
    await toolText(
      server,
      7,
      "yafs.query",
      query("grep -n concise /home/root/work/brief.md"),
    ),
  ).toBe("1:concise");
  expect(
    await toolText(
      server,
      100,
      "yafs.query",
      query('grep -n "concise" /home/root/work/brief.md'),
    ),
  ).toBe("1:concise");
  await assertMutatingQueriesRejected(server, query);
}

async function assertMutatingQueriesRejected(
  server: McpServer,
  query: (source: string) => { source: string },
) {
  const rejected = [
    "mkdir unsafe",
    "echo nope > unsafe",
    "echo $(mkdir unsafe)",
    "cd work",
    "plugins apply",
  ];
  for (const [index, source] of rejected.entries()) {
    expect(
      await toolText(server, 8 + index, "yafs.query", query(source)),
    ).toContain("not read-only");
  }
}

async function assertProtocolEdgeCases(server: McpServer) {
  expect(await request(server, 13, "unknown/method")).toMatchObject({
    error: { code: -32601 },
  });
  expect(
    await server.receive({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  ).toBeUndefined();
  await assertToolArgumentErrors(server);
}

async function assertToolArgumentErrors(server: McpServer) {
  expect(await toolText(server, 14, "yafs.unknown", { path: "/" })).toContain(
    "Unknown tool",
  );
  expect(await toolText(server, 15, "yafs.query", { source: 5 })).toContain(
    "source must be a string",
  );
  expect(await toolText(server, 16, "yafs.read", null)).toContain(
    "Tool arguments must be an object",
  );
}
