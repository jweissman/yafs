import { expect, test } from "bun:test";

import { callTool } from "../src/mcp/Tools";
import { McpClient } from "../src/mcp/types";
import { WorkspaceOperation } from "../src/operations/WorkspaceOperation";

test("fixed MCP tools invoke a typed workspace operation", async () => {
  const seen: WorkspaceOperation[] = [];
  const client: McpClient = {
    execute: async () => { throw new Error("fixed tools must not use source"); },
    operation: async (operation) => resultFor(seen, operation),
  };
  const response = await callTool(client, "yafs.list", { path: "/work" });
  expect(seen).toEqual([{ name: "list", path: "/work" }]);
  expect(response.content[0].text).toBe("brief.md");
});

function resultFor(seen: WorkspaceOperation[], operation: WorkspaceOperation) {
  seen.push(operation);
  return {
    stdout: "brief.md", stderr: "", status: 0,
    session: { user: "root", cwd: "/" as const },
  };
}
