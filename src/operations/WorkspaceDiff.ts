import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { DiffChange } from "./WorkspaceOperation";
import { WorkspaceWalker } from "./WorkspaceWalker";

export function diff(
  context: CommandContext, left: string, right: string, limit = 10000,
): DiffChange[] {
  const leftPath = context.resolve(left);
  const rightPath = context.resolve(right);
  return changes(context, leftPath, rightPath, limit);
}

function changes(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  limit: number,
) {
  return context.type(left) === "directory" && context.type(right) === "directory"
    ? directoryChanges(context, left, right, limit)
    : fileChanges(context, left, right);
}

function fileChanges(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
): DiffChange[] {
  return context.read(left) === context.read(right)
    ? [] : [{ path: ".", kind: "changed" as const }];
}

function directoryChanges(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  limit: number,
): DiffChange[] {
  const paths = [...files(context, left), ...files(context, right)];
  return bounded(compare(context, left, right, [...new Set(paths)].sort()),
    limit);
}

function files(context: CommandContext, path: AbsolutePath) {
  return new WorkspaceWalker(context, 10, 10000).all(path)
    .filter((entry) => entry.type === "file")
    .map((entry) => relative(path, entry.path));
}

function compare(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  paths: string[],
): DiffChange[] {
  return paths.flatMap((path) => change(context, left, right, path));
}

function change(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  path: string,
): DiffChange[] {
  const kind = missing(context, left, right, path);
  return kind ? [{ path, kind }] : changed(context, left, right, path);
}

function missing(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  path: string,
) {
  if (!context.exists(join(left, path))) {
    return "added" as const;
  }
  return missingRight(context, right, path);
}

function missingRight(
  context: CommandContext, right: AbsolutePath, path: string,
) {
  return context.exists(join(right, path)) ? undefined : "removed" as const;
}

function changed(
  context: CommandContext, left: AbsolutePath, right: AbsolutePath,
  path: string,
) {
  return context.read(join(left, path)) === context.read(join(right, path))
    ? [] : [{ path, kind: "changed" as const }];
}

function bounded(changes: DiffChange[], limit: number) {
  if (changes.length > limit) {
    throw new Error("Result limit exceeded");
  }
  return changes;
}

function join(path: AbsolutePath, relative: string) {
  return `${path}/${relative}` as AbsolutePath;
}

function relative(root: AbsolutePath, path: AbsolutePath) {
  return path.slice(root.length + 1);
}
