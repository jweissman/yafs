import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";

export function removeChild(parent: FSNode, name: string, path: AbsolutePath) {
  const index = childIndex(parent, name);
  if (index < 0) {
    throw new Error(`No such file: ${path}`);
  }
  assertFile(parent.children![index], path);
  parent.children!.splice(index, 1);
}

export function removeTreeChild(parent: FSNode, name: string) {
  const index = childIndex(parent, name);
  if (index >= 0) {
    parent.children!.splice(index, 1);
  }
}

function childIndex(parent: FSNode, name: string) {
  return parent.children?.findIndex((child) => child.name === name) ?? -1;
}

function assertFile(node: FSNode, path: AbsolutePath) {
  if (node.dir) {
    throw new Error(`Is a directory: ${path}`);
  }
}
