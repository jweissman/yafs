import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "../commands/CommandContext";
import { boundedPaths, findEntries } from "./WorkspaceFind";
import { testPath } from "./WorkspaceTest";
import { WorkspaceWalker } from "./WorkspaceWalker";
import { WorkspaceOperation, WorkspaceValue } from "./WorkspaceOperation";

export type TreeOperation = Extract<WorkspaceOperation, { name: "tree" }>;
export type FindOperation = Extract<WorkspaceOperation, { name: "find" }>;
export type LiteracyOperation =
  TreeOperation | FindOperation | Extract<WorkspaceOperation, { name: "test" }>;

export function literacy(
  operation: WorkspaceOperation,
): operation is LiteracyOperation {
  return (
    operation.name === "tree" ||
    operation.name === "find" ||
    operation.name === "test"
  );
}

export function literacyValue(
  context: CommandContext,
  operation: LiteracyOperation,
): WorkspaceValue {
  const path = context.resolve(operation.path);
  return dispatch(context, path, operation);
}

function dispatch(
  context: CommandContext,
  path: AbsolutePath,
  operation: LiteracyOperation,
): WorkspaceValue {
  return operation.name === "tree"
    ? tree(context, path, operation)
    : findOrTest(context, path, operation);
}

function findOrTest(
  context: CommandContext,
  path: AbsolutePath,
  operation: Exclude<LiteracyOperation, TreeOperation>,
): WorkspaceValue {
  return operation.name === "find"
    ? find(context, path, operation)
    : test(context, path, operation);
}

function test(
  context: CommandContext,
  path: AbsolutePath,
  operation: Extract<LiteracyOperation, { name: "test" }>,
): WorkspaceValue {
  const { predicate, pattern } = operation;
  const value = testPath(context, { path, predicate, pattern });
  return { kind: "test", value };
}

function tree(
  context: CommandContext,
  path: AbsolutePath,
  operation: TreeOperation,
): WorkspaceValue {
  const instance = walker(context, operation);
  const entries = instance.tree(path);
  return { kind: "tree", path, entries, truncated: instance.wasTruncated() };
}

function find(
  context: CommandContext,
  path: AbsolutePath,
  operation: FindOperation,
): WorkspaceValue {
  const instance = walker(context, { ...operation, limit: undefined });
  const entries = instance.all(path);
  const matches = findEntries(entries, operation.pattern, operation.type);
  return findValue(matches, operation);
}

function findValue(
  matches: AbsolutePath[],
  operation: FindOperation,
): WorkspaceValue {
  const paths = boundedPaths(matches, operation.limit);
  return { kind: "find", paths, truncated: paths.length < matches.length };
}

function walker(
  context: CommandContext,
  operation: TreeOperation | FindOperation,
) {
  const depth = operation.name === "tree" ? (operation.depth ?? 3) : 10;
  const limit = operation.limit ?? 1000;
  return new WorkspaceWalker(context, depth, limit, false);
}
