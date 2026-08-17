/* eslint-disable @typescript-eslint/no-deprecated -- Dynamic JSON schemas and
 * a transport-managed session lifecycle require MCP's low-level server API. */
import { Server as McpProtocolServer } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { boundedToolSet } from "../../mcp/BoundedToolSet";
import { ScopedMcpClient } from "../../mcp/ScopedMcpClient";
import { callTool, failure, tools } from "../../mcp/Tools";

export function mcpServer(scoped: ScopedMcpClient): McpProtocolServer {
  const server = new McpProtocolServer(
    { name: "yafs-agent-tools", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerHandlers(server, scoped);
  return server;
}

function registerHandlers(server: McpProtocolServer, scoped: ScopedMcpClient) {
  const allowed = boundedToolSet();
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(allowed));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callAllowed(scoped, allowed, request),
  );
}

function listTools(allowed: Set<string>) {
  return { tools: tools().filter((tool) => allowed.has(tool.name)) };
}

function callAllowed(
  scoped: ScopedMcpClient,
  allowed: Set<string>,
  request: { params: { name: string; arguments?: unknown } },
) {
  const { name, arguments: args } = request.params;
  return allowed.has(name)
    ? acceptedCall(scoped, name, args)
    : rejectedCall(name);
}

function acceptedCall(scoped: ScopedMcpClient, name: string, args: unknown) {
  console.log(`agent tool call: ${name} ${JSON.stringify(args)}`);
  return callTool(scoped, name, args);
}

function rejectedCall(name: string) {
  console.error(`agent tool call rejected: ${name} not permitted`);
  return failure(new Error(`Tool not permitted: ${name}`));
}

export function badRequest(): Response {
  return jsonRpcError(400, "No valid session ID provided");
}

export function notFound(): Response {
  return jsonRpcError(404, "No such tool-enabled persona");
}

function jsonRpcError(status: number, message: string): Response {
  const body = errorBody(message);
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorBody(message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}
