import { McpId, McpRequest, RawMcpRequest, ValidMcpRequest } from "./types";

export function requestFor(value: unknown): McpRequest {
  const request = requestObject(value);
  if (!validRequest(request)) {
    throw new Error("Invalid JSON-RPC request");
  }
  return request;
}

function validRequest(request: RawMcpRequest): request is ValidMcpRequest {
  return (
    request.jsonrpc === "2.0" &&
    typeof request.method === "string" &&
    validId(request.id)
  );
}

function validId(id: unknown): id is McpId | undefined {
  return (
    id === undefined ||
    id === null ||
    typeof id === "string" ||
    typeof id === "number"
  );
}

function requestObject(value: unknown): RawMcpRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JSON-RPC request");
  }
  return value;
}
