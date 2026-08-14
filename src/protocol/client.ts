import { createConnection, type Socket } from "node:net";

import type { ExecutionResult } from "../types/ExecutionResult";
import { CacheRequest } from "../cache/CacheRequest";
import { completionTarget } from "./CompletionTarget";
import { LineBuffer } from "./LineBuffer";
import { Payload } from "./ClientProtocol";
import { PendingRequests } from "./PendingRequests";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import {
  attachSocketEvents,
  connected,
  matches,
  writeRequest,
} from "./ClientTransport";

type Address = { host: string; port: number };

export class YashClient {
  private lines = new LineBuffer();
  private requests: PendingRequests;

  private constructor(private readonly socket: Socket) {
    this.requests = new PendingRequests(
      () => socket.destroyed,
      (id, payload) => writeRequest(socket, id, payload),
    );
    socket.setEncoding("utf8");
    attachSocketEvents(socket, this.lines, this.requests);
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
  operation(request: WorkspaceOperation): Promise<ExecutionResult> {
    return this.send({ operation: request });
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
    return result.error ? [] : matches(result.stdout, completion);
  }

  private send(payload: Payload): Promise<ExecutionResult> {
    return this.requests.send(payload);
  }
}
