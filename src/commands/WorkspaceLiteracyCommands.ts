import { WorkspaceOperations } from "../operations/WorkspaceOperations";
import {
  WorkspaceOperation,
  WorkspaceValue,
} from "../operations/WorkspaceOperation";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { tree, find, test, diff } from "./WorkspaceLiteracyArgs";

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
  return { name, synopsis: name, access: "read", execute: run(operation) };
}

function run(operation: (args: string[]) => WorkspaceOperation) {
  return (context: CommandContext, args: string[]) =>
    render(invoke(context, operation(args)));
}

function invoke(context: CommandContext, operation: WorkspaceOperation) {
  return new WorkspaceOperations(() => context).invoke(operation);
}

export function render(value: WorkspaceValue) {
  return value.kind === "tree"
    ? value.entries.map((entry) => entry.path).join("\n")
    : value.kind === "find"
      ? value.paths.join("\n")
      : renderRest(value);
}

function renderRest(value: WorkspaceValue) {
  return value.kind === "test"
    ? String(value.value)
    : value.kind === "diff"
      ? value.changes.map(format).join("\n")
      : "";
}

function format(change: import("../operations/WorkspaceOperation").DiffChange) {
  return `${change.kind} ${change.path}`;
}
