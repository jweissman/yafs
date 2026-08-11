import { type Socket } from "node:net";

import { type ExecutionResult } from "../types/ExecutionResult";
import { PROTOCOL_VERSION } from "./version";
import { CacheRequest } from "../cache/CacheRequest";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import { RequestError, verifyRequest } from "./FramingValidation";

export type CommandRequest = { version: number; id: number; command: string };
export type WriteRequest = {
  version: number;
  id: number;
  write: { path: string; content: string };
};
export type CacheProtocolRequest = {
  version: number;
  id: number;
  cache: CacheRequest;
};
export type OperationProtocolRequest = {
  version: number;
  id: number;
  operation: WorkspaceOperation;
};
export type Request =
  | CommandRequest
  | WriteRequest
  | CacheProtocolRequest
  | OperationProtocolRequest;
export type Response = { version: number; id: number; result: ExecutionResult };
export type ProtocolFailure = {
  version: number;
  id: number;
  error: { code: string; message: string };
};

export function parseRequest(line: string): Request {
  const request = JSON.parse(line) as Request;
  verifyRequest(request);
  return request;
}

export function isWriteRequest(request: Request): request is WriteRequest {
  return "write" in request;
}
export function isCacheRequest(
  request: Request,
): request is CacheProtocolRequest {
  return "cache" in request;
}
export function isOperationRequest(
  request: Request,
): request is OperationProtocolRequest {
  return "operation" in request;
}

export function requestFailure(error: unknown): ProtocolFailure | undefined {
  return error instanceof RequestError && Number.isInteger(error.id)
    ? failure(error.id, error.code, error.message)
    : undefined;
}

export function respond(socket: Socket, response: Response | ProtocolFailure) {
  if (!socket.destroyed) {
    socket.write(JSON.stringify(response) + "\n");
  }
}

export function requestOrReject(
  line: string,
  socket: Socket,
): Request | undefined {
  try {
    return parseRequest(line);
  } catch (error) {
    return rejectRequest(error, socket);
  }
}

function rejectRequest(error: unknown, socket: Socket): undefined {
  const failure = requestFailure(error);
  if (failure) {
    respond(socket, failure);
    return undefined;
  }
  socket.destroy();
  return undefined;
}

export function persistenceFailure(
  id: number,
  error: unknown,
): ProtocolFailure {
  const message = error instanceof Error ? error.message : String(error);
  return failure(id, "persistence_error", message);
}

export { attachLines } from "./SocketLines";

function failure(id: number, code: string, message: string): ProtocolFailure {
  return { version: PROTOCOL_VERSION, id, error: { code, message } };
}
