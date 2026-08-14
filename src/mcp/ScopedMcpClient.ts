import { ExecutionResult } from "../types/ExecutionResult";
import {
  StartHereValue,
  WorkspaceOperation,
} from "../operations/WorkspaceOperation";
import { normalize } from "../core/PathResolver";
import { McpClient } from "./types";
import { scopedStartHere } from "./ScopedStartHere";
import { pathsOf, Scopable } from "./ScopedMcpPaths";

export type ScopedMcpConfig = {
  roots: string[];
  maxResultBytes: number;
  maxCalls: number;
  deadlineMs: number;
};

export class ScopedMcpClient implements McpClient {
  private calls = 0;
  private readonly deadline: number;

  constructor(
    private readonly inner: McpClient,
    private readonly config: ScopedMcpConfig,
    now: () => number = Date.now,
  ) {
    this.deadline = now() + config.deadlineMs;
  }

  async execute(_command: string): Promise<ExecutionResult> {
    throw new Error("yafs.query is not permitted for a scoped agent tool");
  }

  async operation(request: WorkspaceOperation): Promise<ExecutionResult> {
    this.assertBudget();
    if (request.name === "startHere") {
      return this.scopedStartHere(request);
    }
    this.assertScoped(request);
    return this.bounded(await this.inner.operation(request));
  }

  private async scopedStartHere(
    request: Extract<WorkspaceOperation, { name: "startHere" }>,
  ): Promise<ExecutionResult> {
    const result = await this.inner.operation(request);
    return result.error
      ? result
      : { ...result, stdout: this.scopedStdout(result.stdout) };
  }

  private scopedStdout(stdout: string): string {
    const value = JSON.parse(stdout) as StartHereValue;
    return JSON.stringify(scopedStartHere(value, this.config.roots));
  }

  private assertBudget() {
    this.calls += 1;
    if (this.calls > this.config.maxCalls) {
      throw this.logged(`Tool call budget exceeded: ${this.config.maxCalls}`);
    }
    if (Date.now() > this.deadline) {
      throw this.logged("Tool call deadline exceeded");
    }
  }

  private assertScoped(request: Scopable) {
    const outside = pathsOf(request).filter((path) => !this.underRoot(path));
    if (outside.length) {
      throw this.logged(`Path outside allowed roots: ${outside.join(", ")}`);
    }
  }

  private logged(message: string): Error {
    console.error(`agent tool call rejected: ${message}`);
    return new Error(message);
  }

  // Compares normalized segment arrays, not raw prefix strings — a raw
  // string comparison would let a path containing ".." (e.g.
  // "/root/pr-482/../secrets") slip past the check on the unresolved
  // text while resolving outside the root once the VFS normalizes it.
  private underRoot(path: string): boolean {
    const segments = normalize(path);
    return this.config.roots.some((root) => startsWith(segments, root));
  }

  private bounded(result: ExecutionResult): ExecutionResult {
    const stdout = truncated(result.stdout, this.config.maxResultBytes);
    return { ...result, stdout };
  }
}

function startsWith(segments: string[], root: string): boolean {
  const rootSegments = normalize(root);
  return rootSegments.every((segment, i) => segments[i] === segment);
}

function truncated(text: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) {
    return text;
  }
  const cut = Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8");
  return `${cut}\n[truncated: result exceeded ${maxBytes}-byte tool budget]`;
}
