import { NodeType, WorkspaceOperation } from "../operations/WorkspaceOperation";

type Arguments = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: object };

export function literacyTools(): Tool[] {
  return [treeTool(), findTool(), testTool(), grepTool(), diffTool()];
}

export function literacyOperation(name: string, input: Arguments) {
  return name === "yafs.tree" ? tree(input)
    : name === "yafs.find" ? find(input)
        : name === "yafs.test" ? test(input)
        : name === "yafs.grep" ? grep(input)
          : name === "yafs.diff" ? diff(input) : undefined;
}

function diffTool(): Tool {
  return tool("yafs.diff", "Compare two virtual files or directories.", {
    left: string(), right: string(), limit: integer(),
  }, ["left", "right"]);
}

function grepTool(): Tool {
  return tool("yafs.grep", "Find literal text in virtual files.", {
    pattern: string(), paths: { type: "array", items: string() }, limit: integer(),
  }, ["pattern", "paths"]);
}

function treeTool(): Tool {
  return tool("yafs.tree", "List a bounded virtual directory tree.", {
    path: string(), depth: integer(), limit: integer(),
  }, ["path"]);
}

function findTool(): Tool {
  return tool("yafs.find", "Find bounded virtual paths.", {
    path: string(), pattern: string(), type: string(), limit: integer(),
  }, ["path"]);
}

function testTool(): Tool {
  return tool("yafs.test", "Evaluate one virtual path predicate.", {
    path: string(), predicate: string(),
  }, ["path", "predicate"]);
}

function tool(
  name: string, description: string, properties: object, required: string[],
): Tool {
  return { name, description, inputSchema: { type: "object", additionalProperties: false, properties, required } };
}

function tree(input: Arguments): WorkspaceOperation {
  return { name: "tree", path: path(input), depth: optionalInteger(input.depth), limit: optionalInteger(input.limit) };
}

function find(input: Arguments): WorkspaceOperation {
  return { name: "find", path: path(input), pattern: optionalString(input.pattern), type: optionalType(input.type), limit: optionalInteger(input.limit) };
}

function test(input: Arguments): WorkspaceOperation {
  return { name: "test", path: path(input), predicate: predicate(input.predicate) };
}

function grep(input: Arguments): WorkspaceOperation {
  return {
    name: "grep", pattern: requiredString(input.pattern),
    paths: paths(input.paths), limit: optionalInteger(input.limit),
  };
}

function diff(input: Arguments): WorkspaceOperation {
  return {
    name: "diff", left: pathValue(input.left), right: pathValue(input.right),
    limit: optionalInteger(input.limit),
  };
}


function path(input: Arguments) {
  return pathValue(input.path);
}

function pathValue(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error("path must be an absolute Yafs path");
  }
  return value;
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("paths must be an array");
  }
  return value.map(requiredString);
}
function requiredString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("value must be a string");
  }
  return value;
}

function predicate(value: unknown): "-e" | "-f" | "-d" | "-L" {
  if (value === "-e" || value === "-f" || value === "-d" || value === "-L") {
    return value;
  }
  throw new Error("predicate must be one of -e, -f, -d, -L");
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || typeof value === "string") {
    return value as string | undefined;
  }
  throw new Error("value must be a string");
}
function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || Number.isInteger(value)) {
    return value as number | undefined;
  }
  throw new Error("value must be an integer");
}
function optionalType(value: unknown): NodeType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "file" || value === "directory" || value === "symlink") {
    return value;
  }
  throw new Error("type must be file, directory, or symlink");
}
function string() { return { type: "string" }; }
function integer() { return { type: "integer", minimum: 0 }; }
