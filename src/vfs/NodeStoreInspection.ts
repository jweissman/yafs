import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode, ProviderOrigin } from "./FSNode";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";

export class NodeStoreInspection {
  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {}
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
    if (path === "/") {
      return ["/"];
    }
    return this.findOrigins(this.state.origin, path.slice(1).split("/"), path);
  }
  provenance(path: AbsolutePath): { path: string; origin?: ProviderOrigin }[] {
    return this.origins(path).map((origin) =>
      this.provenanceItem(origin as AbsolutePath),
    );
  }
  mounts(): { path: string; layers: string[] }[] {
    const mounts: { path: string; layers: string[] }[] = [];
    this.collect(this.state.origin, mounts);
    return mounts;
  }
  private findOrigins(
    node: FSNode,
    parts: string[],
    path: AbsolutePath,
  ): string[] {
    if (node.unionLayers) {
      return this.resolver
        .layers(node)
        .map((layer) => this.resolver.resolveFrom(layer, parts))
        .filter(this.node)
        .map((item) => this.resolver.pathOf(item));
    }
    return this.childOrigins(node, parts, path);
  }
  private childOrigins(node: FSNode, parts: string[], path: AbsolutePath) {
    const child = node.children?.find((item) => item.name === parts[0]);
    if (!child) {
      throw new Error(`No such file: ${path}`);
    }
    return parts.length === 1
      ? [this.resolver.pathOf(child)]
      : this.nextOrigins(child, parts, path);
  }
  private nextOrigins(node: FSNode, parts: string[], path: AbsolutePath) {
    return this.findOrigins(node, parts.slice(1), path);
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
  private node(value: FSNode | undefined): value is FSNode {
    return !!value;
  }
  private provenanceItem(path: AbsolutePath) {
    return { path, origin: this.resolver.get(path)?.providerOrigin };
  }
}
