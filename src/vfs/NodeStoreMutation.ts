import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreRmdir } from "./NodeStoreRmdir";
import { NodeStoreState } from "./NodeStoreState";
import { NodeStoreWritability } from "./NodeStoreWritability";
import { canonicalUnionLayers } from "./UnionLayers";
import { VfsOperation } from "./VfsOperation";
import { applyOperation } from "./NodeStoreApply";

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
    this.removeChild(parent, name, path);
  }
  private removeChild(parent: FSNode, name: string, path: AbsolutePath) {
    const index =
      parent.children?.findIndex((child) => child.name === name) ?? -1;
    if (index < 0) {
      throw new Error(`No such file: ${path}`);
    }
    this.assertFile(parent.children![index], path);
    parent.children!.splice(index, 1);
  }
  private assertFile(node: FSNode, path: AbsolutePath) {
    if (node.dir) {
      throw new Error(`Is a directory: ${path}`);
    }
  }
  rmdir(path: AbsolutePath) {
    this.rmdirOp.run(path);
  }
  removeTree(path: AbsolutePath) {
    const { parent, name } = this.parent(path);
    const index =
      parent.children?.findIndex((child) => child.name === name) ?? -1;
    if (index >= 0) {
      parent.children!.splice(index, 1);
    }
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
    this.assertAbsent(parent, name, path);
    this.state.createNode(name, false, parent, at).symlinkTarget = target;
  }
  union(
    path: AbsolutePath,
    layers: AbsolutePath[],
    at = this.state.clock.now(),
  ) {
    const resolved = canonicalUnionLayers(this.resolver, layers);
    const { parent, name } = this.parent(path);
    this.assertAbsent(parent, name, path);
    this.state.createNode(name, true, parent, at).unionLayers = resolved;
  }
  apply(operation: VfsOperation) {
    return applyOperation(this, operation);
  }
  private create(path: AbsolutePath, dir: boolean, at: Date) {
    this.assertWritable(path);
    const { parent, name } = this.parent(path);
    this.assertAbsent(parent, name, path);
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
    const parts = path.slice(1).split("/");
    const name = parts.pop();
    const parentPath = `/${parts.join("/")}` as AbsolutePath;
    return this.checkedParent(this.resolver.get(parentPath), name, parentPath);
  }
  private checkedParent(
    parent: FSNode | undefined,
    name: string | undefined,
    path: AbsolutePath,
  ) {
    if (!name || !parent) {
      throw new Error(`No such parent directory: ${path}`);
    }
    this.assertWritableDirectory(parent, path);
    return { parent, name };
  }
  private assertWritableDirectory(parent: FSNode, path: AbsolutePath) {
    if (!parent.dir) {
      throw new Error(`Not a directory: ${path}`);
    }
    if (parent.unionLayers) {
      throw new Error(`Read-only union mount: ${path}`);
    }
  }
  private assertAbsent(parent: FSNode, name: string, path: AbsolutePath) {
    if (parent.children?.some((child) => child.name === name)) {
      throw new Error(`Path already exists: ${path}`);
    }
  }
  private assertWritable(path: AbsolutePath) {
    this.writability.assertWritable(path);
  }
}
