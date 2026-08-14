import { expect, test } from "bun:test";

import { evidenceOperation, evidenceTools } from "../../src/mcp/EvidenceTools";

test("evidence tools map fixed MCP input to typed operations", () => {
  expect(evidenceTools()).toHaveLength(2);
  expect(
    evidenceOperation("yafs.capture", {
      source: "/source",
      artifact: "/artifacts/one",
    }),
  ).toEqual({ name: "capture", source: "/source", artifact: "/artifacts/one" });
  expect(
    evidenceOperation("yafs.restore", {
      artifact: "/artifacts/one",
      destination: "/restored",
    }),
  ).toEqual({
    name: "restore",
    artifact: "/artifacts/one",
    destination: "/restored",
  });
  expect(evidenceOperation("yafs.unknown", {})).toBeUndefined();
});

test("evidence tools reject host and relative paths", () => {
  expect(() =>
    evidenceOperation("yafs.capture", {
      source: "relative",
      artifact: "/artifacts/one",
    }),
  ).toThrow("absolute Yafs path");
  expect(() =>
    evidenceOperation("yafs.restore", {
      artifact: "/artifacts/one",
      destination: 1,
    }),
  ).toThrow("absolute Yafs path");
});

test("evidence tools reject a non-integer capture limit", () => {
  expect(() =>
    evidenceOperation("yafs.capture", {
      source: "/source",
      artifact: "/artifacts/one",
      limit: "not-a-number",
    }),
  ).toThrow("limit must be an integer");
});
