import { PROTOCOL_VERSION } from "./version";
import { validCacheRequest } from "../cache/CacheRequest";
import { validOperation } from "./OperationRequest";
import type {
  CommandRequest,
  CacheProtocolRequest,
  OperationProtocolRequest,
  Request,
  WriteRequest,
} from "./Framing";

export function verifyRequest(request: Request) {
  if (!Number.isInteger(request.id) || !validPayload(request)) {
    throw new Error("Expected request");
  }
  assertVersion(request);
}

function assertVersion(request: Request) {
  if (request.version !== PROTOCOL_VERSION) {
    const message = `Unsupported protocol version: ${request.version}`;
    throw new RequestError(request.id, "unsupported_version", message);
  }
}

function validPayload(request: Request) {
  const write = (request as Partial<WriteRequest>).write;
  const cache = (request as Partial<CacheProtocolRequest>).cache;
  const operation = (request as Partial<OperationProtocolRequest>).operation;
  return (
    typeof (request as Partial<CommandRequest>).command === "string" ||
    Boolean(write && validWrite(write)) ||
    validCacheRequest(cache) ||
    validOperation(operation)
  );
}

function validWrite(write: WriteRequest["write"]) {
  return typeof write.path === "string" && typeof write.content === "string";
}

export class RequestError extends Error {
  constructor(
    readonly id: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
