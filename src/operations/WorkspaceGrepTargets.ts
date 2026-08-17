import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { WorkspaceWalker } from "./WorkspaceWalker";
import { expandGlob } from "./WorkspaceGlob";

const DIRECTORY_WALK_DEPTH = 10;
const DIRECTORY_WALK_LIMIT = 5000;

// A path element may be a literal file, a literal directory (searched
// recursively across every file beneath it), or contain a single
// wildcard segment (e.g. "pulls/*/diff.patch") -- expanded against real
// directory listings, since the model has no shell to glob with itself.
export function targetsFor(
  context: CommandContext,
  value: string,
): AbsolutePath[] {
  const roots = value.includes("*")
    ? expandGlob(context, value)
    : [context.resolve(value)];
  return roots.flatMap((path) => filesAt(context, path));
}

function filesAt(context: CommandContext, path: AbsolutePath): AbsolutePath[] {
  return context.type(path, false) === "directory"
    ? filesUnder(context, path)
    : [path];
}

function filesUnder(
  context: CommandContext,
  path: AbsolutePath,
): AbsolutePath[] {
  return directoryWalker(context)
    .all(path)
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path);
}

function directoryWalker(context: CommandContext) {
  return new WorkspaceWalker(
    context,
    DIRECTORY_WALK_DEPTH,
    DIRECTORY_WALK_LIMIT,
    false,
  );
}
