import { createConnection, type Socket } from "node:net";

import type { ExecutionResult } from "../types/ExecutionResult";
import { PROTOCOL_VERSION } from "./version";
import { CacheRequest } from "../cache/CacheRequest";
import { completionTarget } from "./CompletionTarget";
import { LineBuffer } from "./LineBuffer";
import {
  ErrorResolver,
  PendingRequest,
  Payload,
  ProtocolFailure,
  Response,
  ResultResolver,
} from "./ClientProtocol";

type Address = { host: string; port: number };

export class YashClient {
  private nextId = 1;
  private lines = new LineBuffer();
  private pending = new Map<number, PendingRequest>();

  private constructor(private readonly socket: Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this.receive(String(chunk)));
    socket.on("error", (error) => this.failPending(error));
    socket.on("close", () => this.failPending(new Error("Connection closed")));
  }

  static async connect(address: Address): Promise<YashClient> {
    const socket = createConnection(address);
    await connected(socket);
    return new YashClient(socket);
  }

  async exec(command: string): Promise<string> {
    const result = await this.execute(command);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.stdout;
  }

  execute(command: string): Promise<ExecutionResult> {
    return this.send({ command });
  }

  writeFile(path: string, content: string): Promise<ExecutionResult> {
    return this.send({ write: { path, content } });
  }
  cachePut(key: string, value: string, ttlMs: number) {
    return this.cache({ operation: "put", key, value, ttlMs });
  }
  cacheGet(key: string) {
    return this.cache({ operation: "get", key });
  }
  cacheStat(key: string) {
    return this.cache({ operation: "stat", key });
  }
  cacheDelete(key: string) {
    return this.cache({ operation: "delete", key });
  }
  cacheGc() {
    return this.cache({ operation: "gc" });
  }
  private cache(request: CacheRequest) {
    return this.send({ cache: request });
  }

  async close(): Promise<void> {
    this.socket.end();
    await new Promise<void>((resolve) => this.socket.once("close", resolve));
  }

  async complete(input: string): Promise<string[]> {
    const completion = completionTarget(input);
    const result = await this.execute(`ls ${completion.directory}`);
    if (result.error) {
      return [];
    }
    return result.stdout
      .split("\n")
      .filter((name) => name.startsWith(completion.prefix))
      .map(completion.format);
  }

  private receive(chunk: string) {
    this.lines.push(chunk);
    this.lines
      .lines()
      .forEach((line) => this.resolve(JSON.parse(line) as Response));
  }

  private send(payload: Payload): Promise<ExecutionResult> {
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
    if (this.socket.destroyed) {
      return reject(new Error("Connection closed"));
    }
    this.pending.set(id, { resolve, reject });
    this.writeRequest(id, payload);
  }

  private writeRequest(id: number, payload: Payload) {
    const request = JSON.stringify({
      version: PROTOCOL_VERSION,
      id,
      ...payload,
    });
    this.socket.write(`${request}\n`);
  }

  private resolve(response: Response | ProtocolFailure) {
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
    if ("error" in response) {
      return pending.reject(new Error(response.error.message));
    }
    pending.resolve(response.result);
  }

  private failPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}
