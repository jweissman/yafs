import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { McpServer } from "./Server";
import { McpResponse } from "./types";

export async function runStdioMcpServer(server: McpServer): Promise<void> {
  const lines = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    await respond(server, line);
  }
}

async function respond(server: McpServer, line: string) {
  try {
    write(await server.receive(JSON.parse(line)));
  } catch (error) {
    write(failure(error));
  }
}

function write(response: McpResponse | undefined) {
  if (response) {
    stdout.write(`${JSON.stringify(response)}\n`);
  }
}

function failure(error: unknown): McpResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { jsonrpc: "2.0", id: null, error: { code: -32600, message } };
}
