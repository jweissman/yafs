import { WorkspaceOperation } from "../operations/WorkspaceOperation";

type Arguments = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

export function evidenceTools(): Tool[] {
  return [captureTool(), restoreTool()];
}

export function evidenceOperation(name: string, input: Arguments) {
  return name === "yafs.capture"
    ? capture(input)
    : name === "yafs.restore"
      ? restore(input)
      : undefined;
}

function captureTool(): Tool {
  const properties = { source: string(), artifact: string(), limit: integer() };
  return tool("yafs.capture", "Capture durable workspace evidence.", {
    properties,
    required: ["source", "artifact"],
  });
}

function restoreTool(): Tool {
  const properties = { artifact: string(), destination: string() };
  return tool("yafs.restore", "Restore captured workspace evidence.", {
    properties,
    required: ["artifact", "destination"],
  });
}

interface ToolSpec {
  properties: object;
  required: string[];
}

function tool(name: string, description: string, spec: ToolSpec): Tool {
  return { name, description, inputSchema: schema(spec) };
}

function schema(spec: ToolSpec) {
  return {
    type: "object",
    additionalProperties: false,
    properties: spec.properties,
    required: spec.required,
  };
}

function capture(input: Arguments): WorkspaceOperation {
  return {
    name: "capture",
    source: path(input.source),
    artifact: path(input.artifact),
    limit: optionalInteger(input.limit),
  };
}

function restore(input: Arguments): WorkspaceOperation {
  return {
    name: "restore",
    artifact: path(input.artifact),
    destination: path(input.destination),
  };
}

function path(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error("path must be an absolute Yafs path");
  }
  return value;
}

function string() {
  return { type: "string" };
}
function integer() {
  return { type: "integer", minimum: 0 };
}
function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || Number.isInteger(value)) {
    return value as number | undefined;
  }
  throw new Error("limit must be an integer");
}
