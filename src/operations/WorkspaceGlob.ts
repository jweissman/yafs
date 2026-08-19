import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { wildcard } from "./WorkspaceFind";
import { doubleStarMatches } from "./WorkspaceGlobDoubleStar";
import { safeList, child } from "./WorkspaceGlobSupport";

type Matcher = (
  context: CommandContext,
  base: AbsolutePath,
  segment: string,
) => AbsolutePath[];

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
  return matcherFor(segment)(context, base, segment);
}

function matcherFor(segment: string): Matcher {
  if (segment === "**") {
    return doubleStarMatches;
  }
  return segment.includes("*") ? wildcardChildren : fixedChild;
}

function wildcardChildren(
  context: CommandContext,
  base: AbsolutePath,
  segment: string,
): AbsolutePath[] {
  return safeList(context, base)
    .filter((name) => wildcard(name, segment))
    .map((name) => child(base, name));
}

function fixedChild(
  context: CommandContext,
  base: AbsolutePath,
  segment: string,
) {
  const path = child(base, segment);
  return context.exists(path) ? [path] : [];
}
