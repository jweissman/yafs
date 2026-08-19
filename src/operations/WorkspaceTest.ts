import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { NodeType, TestPredicate } from "./WorkspaceOperation";

export interface TestQuery {
  path: AbsolutePath;
  predicate: TestPredicate;
  pattern?: string;
}

export function testPath(context: CommandContext, query: TestQuery) {
  const { path, predicate } = query;
  if (predicate === "-e") {
    return context.exists(path);
  }
  if (predicate === "-c") {
    return contains(context, query);
  }
  return typed(context, path, predicate);
}

function contains(context: CommandContext, query: TestQuery): boolean {
  const pattern = requiredPattern(query.pattern);
  try {
    return context.read(query.path).includes(pattern);
  } catch {
    return false;
  }
}

function requiredPattern(pattern?: string): string {
  if (pattern === undefined) {
    throw new Error("test -c requires a pattern");
  }
  return pattern;
}

function typed(context: CommandContext, path: AbsolutePath, p: TestPredicate) {
  try {
    return context.type(path, p !== "-L") === expectedType(p);
  } catch {
    return false;
  }
}

function expectedType(predicate: TestPredicate): NodeType {
  return predicate === "-f"
    ? "file"
    : predicate === "-d"
      ? "directory"
      : "symlink";
}
