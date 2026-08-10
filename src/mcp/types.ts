import { ExecutionResult } from "../types/ExecutionResult";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export type McpId = number | string | null;
export type McpRequest = {
  jsonrpc: "2.0";
  id?: McpId;
  method: string;
  params?: unknown;
};
export type McpResponse = {
  jsonrpc: "2.0";
  id: McpId;
  result?: unknown;
  error?: McpError;
};
export type McpError = { code: number; message: string };
export type McpClient = {
  execute(command: string): Promise<ExecutionResult>;
  operation(request: WorkspaceOperation): Promise<ExecutionResult>;
};
