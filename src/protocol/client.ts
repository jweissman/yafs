import { createConnection, type Socket } from "node:net";

import type { ExecutionResult } from "../types/ExecutionResult";
import { PROTOCOL_VERSION } from "./version";
import { CacheRequest } from "../cache/CacheRequest";
import { completionTarget } from "./CompletionTarget";
import { LineBuffer } from "./LineBuffer";
import { Payload, Response } from "./ClientProtocol";
import { PendingRequests } from "./PendingRequests";

type Address = { host: string; port: number };

export class YashClient {
  private lines = new LineBuffer();
  private requests: PendingRequests;

  private constructor(private readonly socket: Socket) {
    this.requests = new PendingRequests(
      () => socket.destroyed,
      (id, payload) => this.writeRequest(id, payload),
    );
    socket.setEncoding("utf8");
    this.attachSocketEvents(socket);
  }

  private attachSocketEvents(socket: Socket) {
    socket.on("data", (chunk) => this.receive(String(chunk)));
    socket.on("error", (error) => this.requests.failAll(error));
    socket.on("close", () =>
      this.requests.failAll(new Error("Connection closed")),
    );
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
    return result.error ? [] : matches(result.stdout, completion);
  }

  private receive(chunk: string) {
    this.lines.push(chunk);
    this.lines
      .lines()
      .forEach((line) => this.requests.resolve(JSON.parse(line) as Response));
  }

  private send(payload: Payload): Promise<ExecutionResult> {
    return this.requests.send(payload);
  }

  private writeRequest(id: number, payload: Payload) {
    const request = JSON.stringify({
      version: PROTOCOL_VERSION,
      id,
      ...payload,
    });
    this.socket.write(`${request}\n`);
  }
}

function matches(
  stdout: string,
  completion: ReturnType<typeof completionTarget>,
) {
  return stdout
    .split("\n")
    .filter((name) => name.startsWith(completion.prefix))
    .map(completion.format);
}

function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}
