import { expect, test } from "bun:test";

import { literacyOperation, literacyTools } from "../../src/mcp/LiteracyTools";

test("literacy tools validate typed MCP arguments", () => {
  expect(literacyTools()).toHaveLength(5);
  invalid("yafs.tree", { path: "relative" });
  invalid("yafs.find", { path: "/", type: "unknown" });
  invalid("yafs.grep", { pattern: "x", paths: "not-paths" });
  invalid("yafs.test", { path: "/", predicate: "-z" });
  invalid("yafs.diff", { left: "/", right: "relative" });
});

test("literacy tools validate individual field types, not just presence", () => {
  invalid("yafs.grep", { pattern: "x", paths: [123] });
  invalid("yafs.find", { path: "/", pattern: 123 });
  invalid("yafs.tree", { path: "/", limit: "five" });
});

function invalid(name: string, input: Record<string, unknown>) {
  expect(() => literacyOperation(name, input)).toThrow("must be");
}
