import { ExecutionResult } from "../types/ExecutionResult";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export type McpId = number | string | null;
export interface McpRequest {
  jsonrpc: "2.0";
  id?: McpId;
  method: string;
  params?: unknown;
}
export interface McpResponse {
  jsonrpc: "2.0";
  id: McpId;
  result?: unknown;
  error?: McpError;
}
export interface McpError {
  code: number;
  message: string;
}
export interface RawMcpRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}
export interface ValidMcpRequest {
  jsonrpc: "2.0";
  id?: McpId;
  method: string;
  params?: unknown;
}
export interface McpClient {
  execute(command: string): Promise<ExecutionResult>;
  operation(request: WorkspaceOperation): Promise<ExecutionResult>;
}
