import { YashClient } from "../protocol/client";
import { ExecutionResult } from "../types/ExecutionResult";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import { McpClient } from "./types";

interface Address {
  host: string;
  port: number;
}

// yafs-mcp is a long-lived stdio process; the daemon it talks to routinely
// gets stopped/restarted during normal development. A plain YashClient
// connects once and stays dead after that, forcing the operator to notice
// and manually reconnect the MCP server itself. Retry once, transparently,
// on exactly the "stale connection" failure -- not on a fresh connect
// failure (e.g. the daemon genuinely isn't running), which should still
// surface normally.
export class ReconnectingClient implements McpClient {
  private client: Promise<YashClient>;

  constructor(private readonly address: Address) {
    this.client = YashClient.connect(address);
  }

  execute(command: string): Promise<ExecutionResult> {
    return this.withReconnect((client) => client.execute(command));
  }

  operation(request: WorkspaceOperation): Promise<ExecutionResult> {
    return this.withReconnect((client) => client.operation(request));
  }

  private async withReconnect<T>(
    call: (client: YashClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await call(await this.client);
    } catch (error) {
      return this.retry(call, error);
    }
  }

  private retry<T>(
    call: (client: YashClient) => Promise<T>,
    error: unknown,
  ): Promise<T> {
    if (!isConnectionClosed(error)) {
      throw error;
    }
    this.client = YashClient.connect(this.address);
    return this.client.then(call);
  }
}

function isConnectionClosed(error: unknown): boolean {
  return error instanceof Error && error.message === "Connection closed";
}
