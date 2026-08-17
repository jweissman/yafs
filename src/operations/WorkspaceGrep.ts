import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { GrepMatch } from "./WorkspaceOperation";
import { WorkspaceWalker } from "./WorkspaceWalker";
import { expandGlob } from "./WorkspaceGlob";

const DIRECTORY_WALK_DEPTH = 10;
const DIRECTORY_WALK_LIMIT = 5000;

export interface GrepResult {
  matches: GrepMatch[];
  truncated: boolean;
}

// Bounded exploratory read, same family as tree/find: a caller (often an
// agent guessing at a limit it can't know in advance) gets a truncated,
// flagged result, never a hard failure -- see WorkspaceWalker's `strict`
// mode for why that distinction matters.
export function grep(
  context: CommandContext,
  pattern: string,
  paths: string[],
  limit = 10000,
): GrepResult {
  const found = paths.flatMap((value) => matchesAt(context, pattern, value));
  return bounded(found, limit);
}

function bounded(matches: GrepMatch[], limit: number): GrepResult {
  return {
    matches: matches.slice(0, limit),
    truncated: matches.length > limit,
  };
}

function matchesAt(context: CommandContext, pattern: string, value: string) {
  return targetsFor(context, value).flatMap((path) =>
    matches(context, pattern, path),
  );
}

// A path element may be a literal file, a literal directory (searched
// recursively across every file beneath it), or contain a single
// wildcard segment (e.g. "pulls/*/diff.patch") -- expanded against real
// directory listings, since the model has no shell to glob with itself.
// Live-observed failure this fixes: an agent tried exactly that glob,
// got a hard "no such file" for the literal `*` path, and (not told the
// call had failed rather than matched nothing) went on to narrate having
// reviewed several diffs it never actually read.
function targetsFor(context: CommandContext, value: string): AbsolutePath[] {
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

function matches(context: CommandContext, pattern: string, path: AbsolutePath) {
  return lines(context.read(path)).flatMap((text, index) =>
    text.includes(pattern) ? [{ path, line: index + 1, text }] : [],
  );
}

function lines(value: string) {
  return value === "" ? [] : value.split("\n");
}
