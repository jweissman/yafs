import { NodeType, WorkspaceOperation } from "../operations/WorkspaceOperation";

export type Arguments = Record<string, unknown>;

export function tree(input: Arguments): WorkspaceOperation {
  return {
    name: "tree",
    path: path(input),
    depth: optionalInteger(input.depth),
    limit: optionalInteger(input.limit),
  };
}

export function find(input: Arguments): WorkspaceOperation {
  return {
    name: "find",
    path: path(input),
    pattern: optionalString(input.pattern),
    type: optionalType(input.type),
    limit: optionalInteger(input.limit),
  };
}

export function test(input: Arguments): WorkspaceOperation {
  return {
    name: "test",
    path: path(input),
    predicate: predicate(input.predicate),
  };
}

export function grep(input: Arguments): WorkspaceOperation {
  return {
    name: "grep",
    pattern: requiredString(input.pattern),
    paths: paths(input.paths),
    limit: optionalInteger(input.limit),
  };
}

export function diff(input: Arguments): WorkspaceOperation {
  return {
    name: "diff",
    left: pathValue(input.left),
    right: pathValue(input.right),
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
