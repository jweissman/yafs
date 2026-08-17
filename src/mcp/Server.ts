import { callTool, failure, tools } from "./Tools";
import {
  McpClient,
  McpId,
  McpRequest,
  McpResponse,
} from "./types";
import { requestFor } from "./McpRequest";

const protocolVersion = "2025-11-25";

export class McpServer {
  constructor(
    private readonly client: McpClient,
    private readonly allowedTools?: ReadonlySet<string>,
  ) {}

  async receive(value: unknown): Promise<McpResponse | undefined> {
    const request = requestFor(value);
    if (request.id === undefined) {
      return undefined;
    }
    return this.respond({ ...request, id: request.id });
  }

  private async respond(
    request: McpRequest & { id: McpId },
  ): Promise<McpResponse> {
    const result = this.standardResult(request.method);
    if (result) {
      return response(request.id, result);
    }
    return this.callOrError(request);
  }

  private standardResult(method: string) {
    if (method === "initialize") {
      return initialized();
    }
    if (method === "tools/list") {
      return { tools: tools().filter((tool) => this.permitted(tool.name)) };
    }
    return undefined;
  }

  private permitted(name: string): boolean {
    return !this.allowedTools || this.allowedTools.has(name);
  }

  private async callOrError(
    request: McpRequest & { id: McpId },
  ): Promise<McpResponse> {
    if (request.method === "tools/call") {
      return response(request.id, await this.call(request));
    }
    return error(request.id, -32601, `Method not found: ${request.method}`);
  }

  private call(request: McpRequest) {
    const params = callParams(request.params);
    if (!this.permitted(params.name)) {
      return failure(new Error(`Tool not permitted: ${params.name}`));
    }
    return callTool(this.client, params.name, params.arguments);
  }
}

function response(id: McpId, result: unknown): McpResponse {
  return { jsonrpc: "2.0", id, result };
}
function error(id: McpId, code: number, message: string): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function initialized() {
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "yafs-mcp", version: "0.1.0" },
  };
}

function callParams(value: unknown): { name: string; arguments: unknown } {
  const params = parameterObject(value);
  if (typeof params.name !== "string") {
    throw new Error("tools/call requires a tool name");
  }
  return { name: params.name, arguments: params.arguments };
}

function parameterObject(value: unknown): {
  name?: unknown;
  arguments?: unknown;
} {
  if (!value || typeof value !== "object") {
    throw new Error("tools/call requires parameters");
  }
  return value;
}
