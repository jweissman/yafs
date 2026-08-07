import type { ExecutionResult } from "../types/ExecutionResult";
import { CacheRequest } from "../cache/CacheRequest";

export type Response = { version: number; id: number; result: ExecutionResult };
export type ProtocolFailure = {
  version: number;
  id: number;
  error: { code: string; message: string };
};
export type Payload =
  | { command: string }
  | { write: { path: string; content: string } }
  | { cache: CacheRequest };

export type ResultResolver = (result: ExecutionResult) => void;
export type ErrorResolver = (error: Error) => void;
export type PendingRequest = { resolve: ResultResolver; reject: ErrorResolver };
