import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { DiffChange } from "./WorkspaceOperation";

export function compare(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  paths: string[],
): DiffChange[] {
  return paths.flatMap((path) => change(context, left, right, path));
}

function change(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  path: string,
): DiffChange[] {
  const kind = missing(context, left, right, path);
  return kind ? [{ path, kind }] : changed(context, left, right, path);
}

function missing(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  path: string,
) {
  return context.exists(join(left, path))
    ? missingRight(context, right, path)
    : ("added" as const);
}

function missingRight(
  context: CommandContext,
  right: AbsolutePath,
  path: string,
) {
  return context.exists(join(right, path)) ? undefined : ("removed" as const);
}

function changed(
  context: CommandContext,
  left: AbsolutePath,
  right: AbsolutePath,
  path: string,
) {
  return context.read(join(left, path)) === context.read(join(right, path))
    ? []
    : [{ path, kind: "changed" as const }];
}

function join(path: AbsolutePath, relative: string) {
  return `${path}/${relative}` as AbsolutePath;
}
