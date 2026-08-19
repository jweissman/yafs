import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { GrepMatch } from "./WorkspaceOperation";
import { targetsFor } from "./WorkspaceGrepTargets";

export interface GrepOptions {
  limit?: number;
  ignoreCase?: boolean;
  invert?: boolean;
  countOnly?: boolean;
  filesOnly?: boolean;
}

export interface GrepResult {
  matches: GrepMatch[];
  truncated: boolean;
  count: number;
  files: AbsolutePath[];
}

export function grep(
  context: CommandContext,
  pattern: string,
  paths: string[],
  options: GrepOptions = {},
): GrepResult {
  return summarized(foundMatches(context, pattern, paths, options), options);
}

function foundMatches(
  context: CommandContext,
  pattern: string,
  paths: string[],
  options: GrepOptions,
): GrepMatch[] {
  return paths.flatMap((value) => matchesAt(context, pattern, value, options));
}

function summarized(found: GrepMatch[], options: GrepOptions): GrepResult {
  const limit = options.limit ?? 10_000;
  const suppressed = Boolean(options.countOnly) || Boolean(options.filesOnly);
  return {
    ...detail(found, limit, suppressed),
    count: found.length,
    files: [...new Set(found.map((match) => match.path))],
  };
}

function detail(found: GrepMatch[], limit: number, suppressed: boolean) {
  return {
    matches: suppressed ? [] : found.slice(0, limit),
    truncated: !suppressed && found.length > limit,
  };
}

function matchesAt(
  context: CommandContext,
  pattern: string,
  value: string,
  options: GrepOptions,
) {
  return targetsFor(context, value).flatMap((path) =>
    matches(context, pattern, path, options),
  );
}

function matches(
  context: CommandContext,
  pattern: string,
  path: AbsolutePath,
  options: GrepOptions,
): GrepMatch[] {
  const needle = options.ignoreCase ? pattern.toLowerCase() : pattern;
  return lineMatches(lines(context.read(path)), needle, options, path);
}

function lineMatches(
  textLines: string[],
  needle: string,
  options: GrepOptions,
  path: AbsolutePath,
): GrepMatch[] {
  return textLines.flatMap((text, index) =>
    isMatch(text, needle, options) ? [{ path, line: index + 1, text }] : [],
  );
}

function isMatch(text: string, needle: string, options: GrepOptions): boolean {
  const haystack = options.ignoreCase ? text.toLowerCase() : text;
  const found = haystack.includes(needle);
  return options.invert ? !found : found;
}

function lines(value: string) {
  return value === "" ? [] : value.split("\n");
}
