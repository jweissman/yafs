import { NodeType, WorkspaceOperation } from "../operations/WorkspaceOperation";
import { option } from "./WorkspaceCommandOption";

export function tree(args: string[]): WorkspaceOperation {
  const [depth, afterDepth] = option(args, "--depth");
  const [limit, paths] = option(afterDepth, "--limit");
  return {
    name: "tree",
    path: required(paths, 0),
    depth: number(depth),
    limit: number(limit),
  };
}

export function find(args: string[]): WorkspaceOperation {
  const [pattern, afterName] = option(args, "--name");
  const [type, afterType] = option(afterName, "--type");
  const [limit, paths] = option(afterType, "--limit");
  const path = required(paths, 0);
  return findOperation({ path, pattern, type, limit });
}

interface FindOptions {
  path: string;
  pattern?: string;
  type?: string;
  limit?: string;
}

function findOperation(o: FindOptions): WorkspaceOperation {
  return {
    name: "find",
    path: o.path,
    pattern: o.pattern,
    type: nodeType(o.type),
    limit: number(o.limit),
  };
}

export function test(args: string[]): WorkspaceOperation {
  const predicate = required(args, 0) as "-e" | "-f" | "-d" | "-L" | "-c";
  return predicate === "-c" ? containsTest(args) : simpleTest(predicate, args);
}

function containsTest(args: string[]): WorkspaceOperation {
  return {
    name: "test",
    predicate: "-c",
    pattern: required(args, 1),
    path: required(args, 2),
  };
}

function simpleTest(
  predicate: "-e" | "-f" | "-d" | "-L",
  args: string[],
): WorkspaceOperation {
  return { name: "test", predicate, path: required(args, 1) };
}

export function diff(args: string[]): WorkspaceOperation {
  const [limit, paths] = option(args, "--limit");
  return {
    name: "diff",
    left: required(paths, 0),
    right: required(paths, 1),
    limit: number(limit),
  };
}

function required(args: string[], index: number) {
  const value = args[index];
  if (!value) {
    throw new Error("missing command argument");
  }
  return value;
}
function number(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value || "")) {
    throw new Error("option must be a number");
  }
  return Number(value);
}

const NODE_TYPES = ["file", "directory", "symlink"];

function nodeType(value: string | undefined): NodeType | undefined {
  if (value === undefined || NODE_TYPES.includes(value)) {
    return value as NodeType | undefined;
  }
  throw new Error("type must be file, directory, or symlink");
}
