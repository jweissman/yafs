import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode, ProviderOrigin } from "./FSNode";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";
import { NodeStoreOrigins } from "./NodeStoreOrigins";

export class NodeStoreInspection {
  private readonly originsFor: NodeStoreOrigins;

  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {
    this.originsFor = new NodeStoreOrigins(state, resolver);
  }
  read(path: AbsolutePath): string {
    const node = this.resolver.get(path);
    if (!node) {
      throw new Error(`No such file: ${path}`);
    }
    if (node.dir) {
      throw new Error(`Is a directory: ${path}`);
    }
    return node.content || "";
  }
  readlink(path: AbsolutePath): string {
    const node = this.resolver.get(path, false);
    if (!node) {
      throw new Error(`No such file: ${path}`);
    }
    if (!node.symlinkTarget) {
      throw new Error(`Not a symbolic link: ${path}`);
    }
    return node.symlinkTarget;
  }
  type(path: AbsolutePath, follow = true): "file" | "directory" | "symlink" {
    const node = this.resolver.get(path, follow);
    if (!node) {
      throw new Error(`No such file: ${path}`);
    }
    return node.symlinkTarget ? "symlink" : node.dir ? "directory" : "file";
  }
  list(path: AbsolutePath): string[] {
    const node = this.resolver.get(path);
    if (!node) {
      throw new Error(`No such directory: ${path}`);
    }
    if (!node.dir) {
      throw new Error(`Not a directory: ${path}`);
    }
    return node.unionLayers ? this.unionNames(node) : this.names(node);
  }
  private unionNames(node: FSNode) {
    return [...new Set(this.resolver.entries(node).map((child) => child.name))];
  }
  private names(node: FSNode) {
    return (node.children || []).map((child) => child.name).sort();
  }
  origins(path: AbsolutePath): string[] {
    return this.originsFor.origins(path);
  }
  provenance(path: AbsolutePath): { path: string; origin?: ProviderOrigin }[] {
    return this.originsFor.provenance(path);
  }
  mounts(): { path: string; layers: string[] }[] {
    const mounts: { path: string; layers: string[] }[] = [];
    this.collect(this.state.origin, mounts);
    return mounts;
  }
  private collect(node: FSNode, mounts: { path: string; layers: string[] }[]) {
    if (node.unionLayers) {
      mounts.push(this.mount(node));
    }
    node.children?.forEach((child) => this.collect(child, mounts));
  }
  private mount(node: FSNode) {
    return { path: this.resolver.pathOf(node), layers: node.unionLayers || [] };
  }
}
