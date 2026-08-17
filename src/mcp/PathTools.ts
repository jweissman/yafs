import { WorkspaceOperation } from "../operations/WorkspaceOperation";

type Arguments = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}
type PathOperationName = "list" | "read" | "inspect";

const OPERATIONS: Partial<Record<string, PathOperationName>> = {
  "yafs.list": "list",
  "yafs.read": "read",
  "yafs.inspect": "inspect",
};

export function pathTools(): Tool[] {
  return [listTool(), readTool(), inspectTool()];
}

export function pathOperation(
  name: string,
  input: Arguments,
): WorkspaceOperation | undefined {
  const operation = OPERATIONS[name];
  return operation ? { name: operation, path: pathArgument(input) } : undefined;
}

function listTool() {
  return tool(
    "yafs.list",
    "List an absolute path in the connected Yafs workspace.",
  );
}

function readTool() {
  return tool(
    "yafs.read",
    "Read a UTF-8 file from the connected Yafs workspace.",
  );
}

function inspectTool() {
  return tool(
    "yafs.inspect",
    "Report type, provenance, and union origins for a Yafs path.",
  );
}

function tool(name: string, description: string): Tool {
  const properties = {
    path: { type: "string", description: "Absolute Yafs path." },
  };
  return { name, description, inputSchema: schema(properties, ["path"]) };
}

function schema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", additionalProperties: false, properties, required };
}

function pathArgument(input: Arguments) {
  const path = input.path;
  if (typeof path !== "string" || !/^\/[A-Za-z0-9._/-]*$/.test(path)) {
    throw new Error("path must be an absolute Yafs path");
  }
  return path;
}
