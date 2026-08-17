import { AbsolutePath } from "../core/AbsolutePath";
import { ProviderOrigin } from "./FSNode";
import { assertAbsent, parentOf } from "./NodeStoreParent";
import { removeTreeChild } from "./NodeStoreRemove";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { canonicalUnionLayers } from "./UnionLayers";

export interface LinkDeps {
  state: NodeStoreState;
  resolver: NodeStoreResolver;
}

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

// Unchecked on purpose: mount lifecycle (SnapshotMaterializer) uses this
// on a private candidate-store copy to remove a provider-owned subtree it
// is about to republish — that subtree is marked read-only for regular
// users, but the system managing that very mount must still be able to
// rewrite it. User-initiated recursive removal must assert writability
// first (see NodeStoreMutation.removeTreeChecked), or a user could delete
// inside a read-only provider mount.
export function removeTree(deps: LinkDeps, path: AbsolutePath) {
  const { parent, name } = parentOf(deps.resolver, path);
  removeTreeChild(parent, name);
}
