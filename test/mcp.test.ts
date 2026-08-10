import { expect, test } from "bun:test";

import { McpServer } from "../src/mcp/Server";
import { LocalYashClient } from "../src/protocol/local";

test("MCP exposes a narrow read and inspection bridge over Yafs", async () => {
  const client = new LocalYashClient();
  await client.exec("mkdir work");
  await client.exec("echo concise > work/brief.md");
  const server = new McpServer(client);
  await assertDiscovery(server);
  await assertReads(server);
  await assertLiteracy(server);
  await assertQueryIsReadOnly(server);
  await assertProtocolEdgeCases(server);
  await client.close();
});

async function assertDiscovery(server: McpServer) {
  expect(await request(server, 1, "initialize")).toMatchObject({
    result: { capabilities: { tools: {} } },
  });
  expect(await request(server, 2, "tools/list")).toMatchObject({
    result: {
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "yafs.list" }),
        expect.objectContaining({ name: "yafs.read" }),
        expect.objectContaining({ name: "yafs.inspect" }),
        expect.objectContaining({ name: "yafs.query" }),
        expect.objectContaining({ name: "yafs.grep" }),
        expect.objectContaining({ name: "yafs.diff" }),
        expect.objectContaining({ name: "yafs.capture" }),
        expect.objectContaining({ name: "yafs.restore" }),
      ]),
    },
  });
}

async function assertLiteracy(server: McpServer) {
  expect(await toolText(server, 20, "yafs.tree", { path: "/home/root/work" })).toContain("brief.md");
  expect(await toolText(server, 21, "yafs.find", { path: "/home/root", pattern: "*.md" })).toContain("brief.md");
  expect(await toolText(server, 22, "yafs.test", { path: "/home/root/work", predicate: "-d" })).toContain("true");
  expect(await toolText(server, 23, "yafs.grep", { pattern: "concise", paths: ["/home/root/work/brief.md"] })).toContain('"line":1');
  expect(await toolText(server, 24, "yafs.grep", {
    pattern: "concise", paths: ["/home/root/work/brief.md"], limit: 0,
  })).toContain("Result limit exceeded");
  expect(await toolText(server, 25, "yafs.diff", {
    left: "/home/root/work/brief.md", right: "/home/root/work/brief.md",
  })).toContain('"changes":[]');
}

async function assertReads(server: McpServer) {
  expect(
    await toolText(server, 3, "yafs.read", {
      path: "/home/root/work/brief.md",
    }),
  ).toBe("concise");
  expect(
    await toolText(server, 4, "yafs.inspect", {
      path: "/home/root/work/brief.md",
    }),
  ).toContain('"kind":"local"');
  expect(await toolText(server, 5, "yafs.inspect", { path: "/" })).toContain(
    '"type":"directory"',
  );
  expect(
    await toolText(server, 6, "yafs.read", { path: "../unsafe" }),
  ).toContain("absolute Yafs path");
}

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

function request(
  server: McpServer,
  id: number,
  method: string,
  params?: unknown,
) {
  return server.receive({ jsonrpc: "2.0", id, method, params });
}

async function toolText(
  server: McpServer,
  id: number,
  name: string,
  args: unknown,
) {
  return text(
    await request(server, id, "tools/call", { name, arguments: args }),
  );
}

function text(response: Awaited<ReturnType<McpServer["receive"]>>) {
  const result = response?.result as { content: { text: string }[] };
  return result.content[0].text;
}
