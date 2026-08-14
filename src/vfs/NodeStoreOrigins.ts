import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode, ProviderOrigin } from "./FSNode";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";

export class NodeStoreOrigins {
  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {}

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
  private findOrigins(
    node: FSNode,
    parts: string[],
    path: AbsolutePath,
  ): string[] {
    return node.unionLayers
      ? this.unionOrigins(node, parts)
      : this.childOrigins(node, parts, path);
  }

  private unionOrigins(node: FSNode, parts: string[]) {
    return this.resolver
      .layers(node)
      .map((layer) => this.resolver.resolveFrom(layer, parts))
      .filter(this.node)
      .map((item) => this.resolver.pathOf(item));
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
  private node(value: FSNode | undefined): value is FSNode {
    return !!value;
  }
  private provenanceItem(path: AbsolutePath) {
    return { path, origin: this.resolver.get(path)?.providerOrigin };
  }
}
