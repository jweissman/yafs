import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";
import { NodeStoreResolver } from "./NodeStoreResolver";

export function parentOf(resolver: NodeStoreResolver, path: AbsolutePath) {
  const parts = path.slice(1).split("/");
  const name = parts.pop();
  const parentPath = absolutePath(`/${parts.join("/")}`);
  return checkedParent(resolver.get(parentPath), name, parentPath);
}

function checkedParent(
  parent: FSNode | undefined,
  name: string | undefined,
  path: AbsolutePath,
) {
  if (!name || !parent) {
    throw new Error(`No such parent directory: ${path}`);
  }
  return withWritableCheck(parent, name, path);
}

function absolutePath(path: string): AbsolutePath {
  return path as AbsolutePath;
}

function withWritableCheck(parent: FSNode, name: string, path: AbsolutePath) {
  assertWritableDirectory(parent, path);
  return { parent, name };
}

function assertWritableDirectory(parent: FSNode, path: AbsolutePath) {
  if (!parent.dir) {
    throw new Error(`Not a directory: ${path}`);
  }
  if (parent.unionLayers) {
    throw new Error(`Read-only union mount: ${path}`);
  }
}

export function assertAbsent(parent: FSNode, name: string, path: AbsolutePath) {
  if (parent.children?.some((child) => child.name === name)) {
    throw new Error(`Path already exists: ${path}`);
  }
}
