import type { ExecutionResult } from "../types/ExecutionResult";
import { CacheRequest } from "../cache/CacheRequest";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export interface Response {
  version: number;
  id: number;
  result: ExecutionResult;
}
export interface ProtocolFailure {
  version: number;
  id: number;
  error: { code: string; message: string };
}
export type Payload =
  | { command: string }
  | { write: { path: string; content: string } }
  | { cache: CacheRequest }
  | { operation: WorkspaceOperation };

export type ResultResolver = (result: ExecutionResult) => void;
export type ErrorResolver = (error: Error) => void;
export interface PendingRequest {
  resolve: ResultResolver;
  reject: ErrorResolver;
}
