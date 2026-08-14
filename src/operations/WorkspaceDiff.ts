import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { DiffChange } from "./WorkspaceOperation";
import { WorkspaceWalker } from "./WorkspaceWalker";
import { compare } from "./WorkspaceDiffCompare";

export function diff(
  context: CommandContext,
  left: string,
  right: string,
  limit = 10000,
): DiffChange[] {
  const leftPath = context.resolve(left);
  const rightPath = context.resolve(right);
  return changes(context, leftPath, rightPath, limit);
}

function changes(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  limit: number,
) {
  return bothDirectories(context, left, right)
    ? directoryChanges(context, left, right, limit)
    : fileChanges(context, left, right);
}

function bothDirectories(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
) {
  const leftIsDir = context.type(left) === "directory";
  return leftIsDir && context.type(right) === "directory";
}

function fileChanges(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
): DiffChange[] {
  return context.read(left) === context.read(right)
    ? []
    : [{ path: ".", kind: "changed" as const }];
}

function directoryChanges(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  limit: number,
): DiffChange[] {
  const found = [...files(context, left), ...files(context, right)];
  const sorted = [...new Set(found)].sort();
  return bounded(compare(context, left, right, sorted), limit);
}

function files(context: CommandContext, path: AbsolutePath) {
  return new WorkspaceWalker(context, 10, 10000)
    .all(path)
    .filter((entry) => entry.type === "file")
    .map((entry) => relative(path, entry.path));
}

function bounded(changes: DiffChange[], limit: number) {
  if (changes.length > limit) {
    throw new Error("Result limit exceeded");
  }
  return changes;
}

function relative(root: AbsolutePath, path: AbsolutePath) {
  return path.slice(root.length + 1);
}
