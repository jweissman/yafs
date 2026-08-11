import { WorkspaceOperations } from "../operations/WorkspaceOperations";
import {
  NodeType,
  WorkspaceOperation,
  WorkspaceValue,
} from "../operations/WorkspaceOperation";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { option } from "./WorkspaceCommandOption";

export function workspaceLiteracyCommands(): BuiltinCommand[] {
  return [
    command("tree", tree),
    command("find", find),
    command("test", test),
    command("diff", diff),
  ];
}

function command(
  name: string,
  operation: (args: string[]) => WorkspaceOperation,
): BuiltinCommand {
  return {
    name,
    synopsis: name,
    access: "read",
    execute: (context, args) => render(invoke(context, operation(args))),
  };
}

function invoke(context: CommandContext, operation: WorkspaceOperation) {
  return new WorkspaceOperations(() => context).invoke(operation);
}

function tree(args: string[]): WorkspaceOperation {
  const [depth, afterDepth] = option(args, "--depth");
  const [limit, paths] = option(afterDepth, "--limit");
  return {
    name: "tree",
    path: required(paths, 0),
    depth: number(depth),
    limit: number(limit),
  };
}

function find(args: string[]): WorkspaceOperation {
  const [pattern, afterName] = option(args, "--name");
  const [type, afterType] = option(afterName, "--type");
  const [limit, paths] = option(afterType, "--limit");
  const path = required(paths, 0);
  return findOperation({ path, pattern, type, limit });
}

type FindOptions = {
  path: string;
  pattern?: string;
  type?: string;
  limit?: string;
};

function findOperation(o: FindOptions): WorkspaceOperation {
  return {
    name: "find",
    path: o.path,
    pattern: o.pattern,
    type: nodeType(o.type),
    limit: number(o.limit),
  };
}

function test(args: string[]): WorkspaceOperation {
  return {
    name: "test",
    predicate: required(args, 0) as "-e" | "-f" | "-d" | "-L",
    path: required(args, 1),
  };
}

function diff(args: string[]): WorkspaceOperation {
  const [limit, paths] = option(args, "--limit");
  return {
    name: "diff",
    left: required(paths, 0),
    right: required(paths, 1),
    limit: number(limit),
  };
}

function render(value: WorkspaceValue) {
  return value.kind === "tree"
    ? value.entries.map((entry) => entry.path).join("\n")
    : value.kind === "find"
      ? value.paths.join("\n")
      : value.kind === "test"
        ? String(value.value)
        : value.kind === "diff"
          ? value.changes.map(format).join("\n")
          : "";
}

function format(change: import("../operations/WorkspaceOperation").DiffChange) {
  return `${change.kind} ${change.path}`;
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

function nodeType(value: string | undefined): NodeType | undefined {
  if (
    value === undefined ||
    value === "file" ||
    value === "directory" ||
    value === "symlink"
  ) {
    return value as NodeType | undefined;
  }
  throw new Error("type must be file, directory, or symlink");
}
