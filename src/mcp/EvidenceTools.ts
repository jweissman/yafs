import { WorkspaceOperation } from "../operations/WorkspaceOperation";

type Arguments = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: object };

export function evidenceTools(): Tool[] {
  return [captureTool(), restoreTool()];
}

export function evidenceOperation(name: string, input: Arguments) {
  return name === "yafs.capture" ? capture(input)
    : name === "yafs.restore" ? restore(input) : undefined;
}

function captureTool(): Tool {
  return tool("yafs.capture", "Capture durable workspace evidence.", {
    source: string(), artifact: string(), limit: integer(),
  }, ["source", "artifact"]);
}

function restoreTool(): Tool {
  return tool("yafs.restore", "Restore captured workspace evidence.", {
    artifact: string(), destination: string(),
  }, ["artifact", "destination"]);
}

function tool(name: string, description: string, properties: object,
  required: string[],
): Tool {
  return { name, description, inputSchema: {
    type: "object", additionalProperties: false, properties, required,
  } };
}

function capture(input: Arguments): WorkspaceOperation {
  return {
    name: "capture", source: path(input.source), artifact: path(input.artifact),
    limit: optionalInteger(input.limit),
  };
}

function restore(input: Arguments): WorkspaceOperation {
  return {
    name: "restore", artifact: path(input.artifact),
    destination: path(input.destination),
  };
}

function path(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error("path must be an absolute Yafs path");
  }
  return value;
}

function string() { return { type: "string" }; }
function integer() { return { type: "integer", minimum: 0 }; }
function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || Number.isInteger(value)) {
    return value as number | undefined;
  }
  throw new Error("limit must be an integer");
}
