import { expect, test } from "bun:test";

import { requestFor } from "../../src/mcp/McpRequest";

test("requestFor rejects non-object JSON-RPC input", () => {
  expect(() => requestFor("not an object")).toThrow("Invalid JSON-RPC request");
});

test("requestFor rejects objects missing the required JSON-RPC shape", () => {
  expect(() => requestFor({ jsonrpc: "1.0", method: 4 })).toThrow(
    "Invalid JSON-RPC request",
  );
});
