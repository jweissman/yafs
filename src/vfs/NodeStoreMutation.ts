import { AbsolutePath } from "../core/AbsolutePath";
import { ProviderOrigin } from "./FSNode";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { parentOf } from "./NodeStoreParent";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreRmdir } from "./NodeStoreRmdir";
import { NodeStoreState } from "./NodeStoreState";
import { NodeStoreWritability } from "./NodeStoreWritability";
import { VfsOperation } from "./VfsOperation";
import { applyOperation } from "./NodeStoreApply";
import { removeChild } from "./NodeStoreRemove";
import {
  LinkDeps,
  removeTree,
  setProviderOrigin,
  symlink,
  union,
} from "./NodeStoreLinks";
import { create, FileDeps, touch, write } from "./NodeStoreFileMutations";

export class NodeStoreMutation {
  private readonly guard = nodeStoreWriteGuard;
  private readonly writability: NodeStoreWritability;
  private readonly rmdirOp: NodeStoreRmdir;
  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {
    this.writability = new NodeStoreWritability(state, resolver);
    this.rmdirOp = this.buildRmdirOp();
  }

  private buildRmdirOp() {
    return new NodeStoreRmdir(
      (path) => {
        this.assertWritable(path);
      },
      (path) => this.parent(path),
    );
  }

  mkdir(path: AbsolutePath, at = this.state.clock.now()) {
    create(this.fileDeps(), path, true, at);
  }
  touch(path: AbsolutePath, at = this.state.clock.now()) {
    touch(this.fileDeps(), path, at);
  }
  write(path: AbsolutePath, content: string, at = this.state.clock.now()) {
    write(this.fileDeps(), { path, content, at });
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
    removeTree(this.linkDeps(), path);
  }
  removeTreeChecked(path: AbsolutePath) {
    this.assertWritable(path);
    this.removeTree(path);
  }
  setProviderOrigin(path: AbsolutePath, origin: ProviderOrigin) {
    setProviderOrigin(this.resolver, this.guard, path, origin);
  }
  symlink(target: string, path: AbsolutePath, at = this.state.clock.now()) {
    symlink(this.linkDeps(), target, path, at);
  }
  union(
    path: AbsolutePath,
    layers: AbsolutePath[],
    at = this.state.clock.now(),
  ) {
    union(this.linkDeps(), path, layers, at);
  }
  private linkDeps(): LinkDeps {
    return { state: this.state, resolver: this.resolver };
  }
  private fileDeps(): FileDeps {
    const { state, resolver } = this;
    return {
      state,
      resolver,
      assertWritable: (path) => {
        this.assertWritable(path);
      },
    };
  }
  apply(operation: VfsOperation) {
    applyOperation(this, operation);
  }
  private parent(path: AbsolutePath) {
    return parentOf(this.resolver, path);
  }
  private assertWritable(path: AbsolutePath) {
    this.writability.assertWritable(path);
  }
}
