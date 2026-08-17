import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";

// Deliberately narrow: one "*" wildcard segment, matching exactly one
// path component (e.g. "pulls/*/diff.patch"). No "**" (zero-or-more
// segments) and no character classes/"?" -- those weren't needed yet.
// "**" is the natural next extension if a caller needs to match across
// a variable-depth subtree rather than one fixed level: add it as a
// third branch in childrenMatching() that recurses into every descendant
// (reusing WorkspaceWalker.all(), the same way filesUnder() already
// does elsewhere in this operation) instead of just direct children.
export function expandGlob(
  context: CommandContext,
  value: string,
): AbsolutePath[] {
  const segments = context.resolve(value).slice(1).split("/");
  return expand(context, "/", segments);
}

function expand(
  context: CommandContext,
  base: AbsolutePath,
  segments: string[],
): AbsolutePath[] {
  if (!segments.length) {
    return [base];
  }
  return expandSegment(context, base, segments);
}

function expandSegment(
  context: CommandContext,
  base: AbsolutePath,
  segments: string[],
) {
  const [segment, ...rest] = segments;
  return childrenMatching(context, base, segment).flatMap((next) =>
    expand(context, next, rest),
  );
}

function childrenMatching(
  context: CommandContext,
  base: AbsolutePath,
  segment: string,
): AbsolutePath[] {
  if (segment !== "*") {
    return fixedChild(context, base, segment);
  }
  return safeList(context, base).map((name) => child(base, name));
}

function fixedChild(
  context: CommandContext,
  base: AbsolutePath,
  segment: string,
) {
  const path = child(base, segment);
  return context.exists(path) ? [path] : [];
}

function safeList(context: CommandContext, base: AbsolutePath): string[] {
  try {
    return context.list(base);
  } catch {
    return [];
  }
}

function child(base: AbsolutePath, name: string): AbsolutePath {
  return base === "/" ? `/${name}` : `${base}/${name}`;
}
