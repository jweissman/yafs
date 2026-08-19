import { AbsolutePath } from "../../core/AbsolutePath";
import { NodeType } from "../../operations/WorkspaceOperation";
import { TreeEntry } from "../../operations/WorkspaceValue";

export function gitType(
  paths: string[],
  relativePath: string,
): NodeType | undefined {
  if (relativePath === "" || isDirectoryPrefix(paths, relativePath)) {
    return "directory";
  }
  return paths.includes(relativePath) ? "file" : undefined;
}

function isDirectoryPrefix(paths: string[], relativePath: string) {
  return paths.some((path) => path.startsWith(`${relativePath}/`));
}

export function gitChildren(paths: string[], relativePath: string): string[] {
  const prefix = prefixFor(relativePath);
  const names = paths
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length).split("/")[0]);
  return [...new Set(names)];
}

export function gitEntries(
  paths: string[],
  relativePath: string,
  mountRoot: AbsolutePath,
): TreeEntry[] {
  const nodes = nodesUnder(paths, relativePath);
  return sortedEntries(nodes, mountRoot, prefixFor(relativePath));
}

function prefixFor(relativePath: string): string {
  return relativePath === "" ? "" : `${relativePath}/`;
}

function nodesUnder(paths: string[], relativePath: string) {
  const prefix = prefixFor(relativePath);
  const nodes = new Map<string, NodeType>();
  paths
    .filter((path) => path.startsWith(prefix))
    .forEach((path) => {
      addNodes(nodes, path.slice(prefix.length));
    });
  return nodes;
}

function addNodes(nodes: Map<string, NodeType>, rest: string) {
  const parts = rest.split("/");
  parts.forEach((_, index) => {
    addNode(nodes, parts, index);
  });
}

function addNode(nodes: Map<string, NodeType>, parts: string[], index: number) {
  const relPath = parts.slice(0, index + 1).join("/");
  if (!nodes.has(relPath)) {
    nodes.set(relPath, index === parts.length - 1 ? "file" : "directory");
  }
}

function sortedEntries(
  nodes: Map<string, NodeType>,
  mountRoot: AbsolutePath,
  prefix: string,
): TreeEntry[] {
  return [...nodes.entries()]
    .map(([rel, type]) => entryFor(rel, type, mountRoot, prefix))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function entryFor(
  relPath: string,
  type: NodeType,
  mountRoot: AbsolutePath,
  prefix: string,
): TreeEntry {
  const path = `${mountRoot}/${prefix}${relPath}` as AbsolutePath;
  return { path, type, depth: relPath.split("/").length };
}
