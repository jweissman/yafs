import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { assertAbsent, parentOf } from "./NodeStoreParent";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreRmdir } from "./NodeStoreRmdir";
import { NodeStoreState } from "./NodeStoreState";
import { NodeStoreWritability } from "./NodeStoreWritability";
import { canonicalUnionLayers } from "./UnionLayers";
import { VfsOperation } from "./VfsOperation";
import { applyOperation } from "./NodeStoreApply";
import { removeChild, removeTreeChild } from "./NodeStoreRemove";

export class NodeStoreMutation {
  private readonly guard = nodeStoreWriteGuard;
  private readonly writability: NodeStoreWritability;
  private readonly rmdirOp: NodeStoreRmdir;
  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {
    this.writability = new NodeStoreWritability(state, resolver);
    this.rmdirOp = new NodeStoreRmdir(
      (path) => this.assertWritable(path),
      (path) => this.parent(path),
    );
  }

  mkdir(path: AbsolutePath, at = this.state.clock.now()) {
    this.create(path, true, at);
  }
  touch(path: AbsolutePath, at = this.state.clock.now()) {
    this.assertWritable(path);
    const existing = this.resolver.get(path);
    if (existing) {
      existing.modifiedAt = at;
      return;
    }
    this.create(path, false, at);
  }
  write(path: AbsolutePath, content: string, at = this.state.clock.now()) {
    this.assertWritable(path);
    const node = this.resolver.get(path);
    if (node) {
      return this.replace(node, path, content, at);
    }
    const { parent, name } = this.parent(path);
    this.state.createNode(name, false, parent, at).content = content;
  }
  remove(path: AbsolutePath) {
    this.assertWritable(path);
    const { parent, name } = this.parent(path);
    removeChild(parent, name, path);
  }
  rmdir(path: AbsolutePath) {
    this.rmdirOp.run(path);
  }
  removeTree(path: AbsolutePath) {
    const { parent, name } = this.parent(path);
    removeTreeChild(parent, name);
  }
  setProviderOrigin(
    path: AbsolutePath,
    origin: import("./FSNode").ProviderOrigin,
  ) {
    const node = this.resolver.get(path, false);
    if (!node) {
      throw new Error(`No such file: ${path}`);
    }
    this.guard.setProviderOrigin(node, origin);
  }
  symlink(target: string, path: AbsolutePath, at = this.state.clock.now()) {
    const { parent, name } = this.parent(path);
    assertAbsent(parent, name, path);
    this.state.createNode(name, false, parent, at).symlinkTarget = target;
  }
  union(
    path: AbsolutePath,
    layers: AbsolutePath[],
    at = this.state.clock.now(),
  ) {
    const resolved = canonicalUnionLayers(this.resolver, layers);
    const { parent, name } = this.parent(path);
    assertAbsent(parent, name, path);
    this.state.createNode(name, true, parent, at).unionLayers = resolved;
  }
  apply(operation: VfsOperation) {
    return applyOperation(this, operation);
  }
  private create(path: AbsolutePath, dir: boolean, at: Date) {
    this.assertWritable(path);
    const { parent, name } = this.parent(path);
    assertAbsent(parent, name, path);
    this.state.createNode(name, dir, parent, at);
  }
  private replace(node: FSNode, path: AbsolutePath, content: string, at: Date) {
    if (node.dir) {
      throw new Error(`Is a directory: ${path}`);
    }
    node.content = content;
    node.modifiedAt = at;
  }
  private parent(path: AbsolutePath) {
    return parentOf(this.resolver, path);
  }
  private assertWritable(path: AbsolutePath) {
    this.writability.assertWritable(path);
  }
}
