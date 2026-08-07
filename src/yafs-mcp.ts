import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { McpServer } from "./mcp/Server";
import { McpResponse } from "./mcp/types";
import { YashClient } from "./protocol/client";

const client = await YashClient.connect({
  host: process.env.YAFS_HOST || "127.0.0.1",
  port: Number(process.env.YAFS_PORT || 7337),
});
const server = new McpServer(client);
const lines = createInterface({ input: stdin, crlfDelay: Infinity });

try {
  for await (const line of lines) {
    await respond(line);
  }
} finally {
  await client.close();
}

async function respond(line: string) {
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
