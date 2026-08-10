import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { NodeType, TestPredicate } from "./WorkspaceOperation";

export function testPath(
  context: CommandContext,
  path: AbsolutePath,
  predicate: TestPredicate,
) {
  if (predicate === "-e") {
    return context.exists(path);
  }
  return typed(context, path, predicate);
}

function typed(context: CommandContext, path: AbsolutePath, p: TestPredicate) {
  try {
    return context.type(path, p !== "-L") === expectedType(p);
  } catch {
    return false;
  }
}

function expectedType(predicate: TestPredicate): NodeType {
  return predicate === "-f" ? "file" : predicate === "-d" ? "directory" : "symlink";
}
