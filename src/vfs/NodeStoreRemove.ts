import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";

export function removeChild(parent: FSNode, name: string, path: AbsolutePath) {
  const children = parent.children;
  const index = children?.findIndex((child) => child.name === name) ?? -1;
  if (!children || index < 0) {
    throw new Error(`No such file: ${path}`);
  }
  assertFile(children[index], path);
  children.splice(index, 1);
}

export function removeTreeChild(parent: FSNode, name: string) {
  const children = parent.children;
  if (!children) {
    return;
  }
  const index = children.findIndex((child) => child.name === name);
  if (index >= 0) {
    children.splice(index, 1);
  }
}

function assertFile(node: FSNode, path: AbsolutePath) {
  if (node.dir) {
    throw new Error(`Is a directory: ${path}`);
  }
}
