import { AbsolutePath } from "../core/AbsolutePath";
import { NodeType, TreeEntry } from "./WorkspaceOperation";

export function findEntries(
  entries: TreeEntry[],
  pattern?: string,
  type?: NodeType,
): AbsolutePath[] {
  return entries
    .filter((entry) => matches(entry, pattern, type))
    .map((entry) => entry.path);
}

export function boundedPaths(paths: AbsolutePath[], limit?: number) {
  if (limit !== undefined && paths.length > limit) {
    throw new Error("Result limit exceeded");
  }
  return paths;
}

function matches(entry: TreeEntry, pattern?: string, type?: NodeType) {
  return (!type || entry.type === type)
    && (!pattern || wildcard(name(entry.path), pattern));
}

function wildcard(value: string, pattern: string) {
  const parts = pattern.split("*");
  return begins(value, parts[0]) && ends(value, parts.at(-1) || "") && contains(value, parts);
}

function begins(value: string, part: string) { return value.startsWith(part); }
function ends(value: string, part: string) { return value.endsWith(part); }
function contains(value: string, parts: string[]) {
  return parts.slice(1, -1).every((part) => value.includes(part));
}
function name(path: AbsolutePath) { return path.split("/").at(-1) || ""; }
