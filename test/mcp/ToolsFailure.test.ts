import { expect, test } from "bun:test";

import { callTool } from "../../src/mcp/Tools";
import { McpClient } from "../../src/mcp/types";

test("a failed command result becomes an MCP tool error", async () => {
  const client = failingClient();
  const result = await callTool(client, "yafs.query", { source: "pwd" });
  expect(result).toEqual({
    content: [{ type: "text", text: "read failed" }],
    isError: true,
  });
});

function failingClient(): McpClient {
  return {
    execute: async () => failure(),
    operation: async () => success(),
  };
}

function failure() {
  return {
    stdout: "", stderr: "", status: 1, session: session(),
    error: { code: "read_failed", message: "read failed" },
  };
}

function success() {
  return { stdout: "", stderr: "", status: 0, session: session() };
}

function session() {
  return { user: "root", cwd: "/home/root" as const };
}
