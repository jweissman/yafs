import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { safeList, child } from "./WorkspaceGlobSupport";

const DOUBLE_STAR_LIMIT = 2000;

export function doubleStarMatches(
  context: CommandContext,
  base: AbsolutePath,
  _segment: string,
): AbsolutePath[] {
  const budget = { remaining: DOUBLE_STAR_LIMIT };
  return [base, ...descendantDirectories(context, base, budget)];
}

function descendantDirectories(
  context: CommandContext,
  base: AbsolutePath,
  budget: { remaining: number },
): AbsolutePath[] {
  return safeList(context, base).flatMap((name) =>
    directoryDescendants(context, child(base, name), budget),
  );
}

function directoryDescendants(
  context: CommandContext,
  path: AbsolutePath,
  budget: { remaining: number },
): AbsolutePath[] {
  if (budget.remaining <= 0 || context.type(path, false) !== "directory") {
    return [];
  }
  return [path, ...nextDescendants(context, path, budget)];
}

function nextDescendants(
  context: CommandContext,
  path: AbsolutePath,
  budget: { remaining: number },
): AbsolutePath[] {
  budget.remaining -= 1;
  return descendantDirectories(context, path, budget);
}
