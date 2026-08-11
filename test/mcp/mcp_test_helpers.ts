import { McpServer } from "../../src/mcp/Server";

export function request(
  server: McpServer,
  id: number,
  method: string,
  params?: unknown,
) {
  return server.receive({ jsonrpc: "2.0", id, method, params });
}

export async function toolText(
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
