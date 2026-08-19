import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode, ProviderOrigin } from "./FSNode";

export const nodeStoreWriteGuard = {
  assertWritable(node: FSNode, path: AbsolutePath) {
    if (isCtl(path)) {
      return;
    }
    assertNotReadOnly(node, path);
  },
  setProviderOrigin(node: FSNode, origin: ProviderOrigin) {
    stampOrigin(node, origin);
  },
};

function isCtl(path: AbsolutePath) {
  return path.split("/").pop() === "ctl";
}

function stampOrigin(node: FSNode, origin: ProviderOrigin) {
  node.providerOrigin = origin;
  for (const child of node.children ?? []) {
    stampOrigin(child, origin);
  }
}

function assertNotReadOnly(node: FSNode, path: AbsolutePath) {
  if (node.providerOrigin?.readOnly) {
    throw new Error(`Read-only mount: ${path}`);
  }
  if (node.unionLayers) {
    throw new Error(`Read-only union mount: ${path}`);
  }
}
