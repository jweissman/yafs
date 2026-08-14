import { readOnlySource } from "../commands/ReadOnlySource";

type Arguments = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: object };

export function queryTool(): Tool {
  return {
    name: "yafs.query",
    description: "Evaluate one read-only Yash command.",
    inputSchema: querySchema(),
  };
}

function querySchema() {
  const properties = { source: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: ["source"],
  };
}

export function queryCommand(input: Arguments): string {
  return readOnlySource(sourceArgument(input));
}

function sourceArgument(input: Arguments) {
  if (typeof input.source !== "string") {
    throw new Error("source must be a string");
  }
  return input.source;
}
