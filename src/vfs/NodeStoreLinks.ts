import { AbsolutePath } from "../core/AbsolutePath";
import { ProviderOrigin } from "./FSNode";
import { assertAbsent, parentOf } from "./NodeStoreParent";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { canonicalUnionLayers } from "./UnionLayers";

export type LinkDeps = { state: NodeStoreState; resolver: NodeStoreResolver };

export function setProviderOrigin(
  resolver: NodeStoreResolver,
  guard: typeof nodeStoreWriteGuard,
  path: AbsolutePath,
  origin: ProviderOrigin,
) {
  const node = resolver.get(path, false) ?? missingFile(path);
  guard.setProviderOrigin(node, origin);
}

function missingFile(path: AbsolutePath): never {
  throw new Error(`No such file: ${path}`);
}

export function symlink(
  deps: LinkDeps,
  target: string,
  path: AbsolutePath,
  at: Date,
) {
  const { parent, name } = newNodeParent(deps, path);
  deps.state.createNode(name, false, parent, at).symlinkTarget = target;
}

export function union(
  deps: LinkDeps,
  path: AbsolutePath,
  layers: AbsolutePath[],
  at: Date,
) {
  const { parent, name } = newNodeParent(deps, path);
  const node = deps.state.createNode(name, true, parent, at);
  node.unionLayers = canonicalUnionLayers(deps.resolver, layers);
}

function newNodeParent(deps: LinkDeps, path: AbsolutePath) {
  const { parent, name } = parentOf(deps.resolver, path);
  assertAbsent(parent, name, path);
  return { parent, name };
}
