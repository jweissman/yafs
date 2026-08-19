import { CommandContext, GitBackingInfo } from "../commands/CommandContext";
import { WorkspaceOperation } from "./WorkspaceOperation";

export async function gitBackedValue(
  context: CommandContext,
  operation: WorkspaceOperation,
) {
  return operation.name === "read"
    ? gitReadIfBacked(context, operation.path)
    : operation.name === "grep"
      ? gitGrepIfBacked(context, operation)
      : undefined;
}

async function gitReadIfBacked(context: CommandContext, value: string) {
  const path = context.resolve(value);
  const backing = context.gitBacking(path);
  if (!backing) {
    return undefined;
  }
  const text = await context.gitRead(backing);
  return { kind: "read" as const, path, text };
}

async function gitGrepIfBacked(
  context: CommandContext,
  operation: Extract<WorkspaceOperation, { name: "grep" }>,
) {
  const backing = singleGitBacking(context, operation.paths);
  return backing ? gitGrepResult(context, backing, operation) : undefined;
}

function singleGitBacking(context: CommandContext, paths: string[]) {
  return paths.length === 1
    ? context.gitBacking(context.resolve(paths[0]))
    : undefined;
}

async function gitGrepResult(
  context: CommandContext,
  backing: GitBackingInfo,
  operation: Extract<WorkspaceOperation, { name: "grep" }>,
) {
  const { pattern } = operation;
  const found = await context.gitGrep(backing, pattern, grepOptions(operation));
  return { kind: "grep" as const, ...found };
}

export function grepOptions(
  operation: Extract<WorkspaceOperation, { name: "grep" }>,
) {
  const { limit, ignoreCase, invert, countOnly, filesOnly } = operation;
  return { limit, ignoreCase, invert, countOnly, filesOnly };
}
