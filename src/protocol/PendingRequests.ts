import type { ExecutionResult } from "../types/ExecutionResult";
import { PROTOCOL_VERSION } from "./version";
import {
  ErrorResolver,
  PendingRequest,
  Payload,
  ProtocolFailure,
  Response,
  ResultResolver,
} from "./ClientProtocol";

type Write = (id: number, payload: Payload) => void;

export class PendingRequests {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  constructor(
    private readonly isClosed: () => boolean,
    private readonly write: Write,
  ) {}

  send(payload: Payload): Promise<ExecutionResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) =>
      this.request(id, payload, resolve, reject),
    );
  }

  private request(
    id: number,
    payload: Payload,
    resolve: ResultResolver,
    reject: ErrorResolver,
  ) {
    return this.isClosed()
      ? reject(new Error("Connection closed"))
      : this.registerAndSend(id, payload, resolve, reject);
  }

  private registerAndSend(
    id: number,
    payload: Payload,
    resolve: ResultResolver,
    reject: ErrorResolver,
  ) {
    this.pending.set(id, { resolve, reject });
    this.write(id, payload);
  }

  resolve(response: Response | ProtocolFailure) {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    this.settle(pending, response);
  }

  private settle(
    pending: PendingRequest,
    response: Response | ProtocolFailure,
  ) {
    if (response.version !== PROTOCOL_VERSION) {
      return pending.reject(new Error("Unsupported protocol version"));
    }
    this.settleVersioned(pending, response);
  }

  private settleVersioned(
    pending: PendingRequest,
    response: Response | ProtocolFailure,
  ) {
    if ("error" in response) {
      return pending.reject(new Error(response.error.message));
    }
    pending.resolve(response.result);
  }

  failAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
