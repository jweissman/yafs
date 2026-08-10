import { CommandContext } from "../commands/CommandContext";
import { GrepMatch } from "./WorkspaceOperation";

export function grep(
  context: CommandContext,
  pattern: string,
  paths: string[],
  limit = 10000,
): GrepMatch[] {
  const found = paths.flatMap((path) => matches(context, pattern, path));
  return bounded(found, limit);
}

function bounded(matches: GrepMatch[], limit: number) {
  if (matches.length > limit) {
    throw new Error("Result limit exceeded");
  }
  return matches;
}

function matches(context: CommandContext, pattern: string, value: string) {
  const path = context.resolve(value);
  return lines(context.read(path)).flatMap((text, index) => {
    return text.includes(pattern) ? [{ path, line: index + 1, text }] : [];
  });
}

function lines(value: string) { return value === "" ? [] : value.split("\n"); }
