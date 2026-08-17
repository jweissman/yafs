import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";

export class NodeStoreUnion {
  constructor(
    private readonly resolve: (path: AbsolutePath) => FSNode | undefined,
  ) {}

  child(node: FSNode, name: string): FSNode | undefined {
    return node.unionLayers
      ? this.layerChild(this.layers(node), name)
      : node.children?.find((candidate) => candidate.name === name);
  }

  entries(node: FSNode): FSNode[] {
    if (!node.unionLayers) {
      return node.children ?? [];
    }
    const entries = new Map<string, FSNode>();
    this.layers(node).forEach((layer) => {
      this.addEntries(entries, layer);
    });
    return [...entries.values()];
  }

  layers(node: FSNode): FSNode[] {
    return (node.unionLayers ?? [])
      .map((path) => this.resolve(path))
      .filter((item) => this.directory(item));
  }

  private layerChild(layers: FSNode[], name: string): FSNode | undefined {
    for (const layer of layers) {
      const child = this.child(layer, name);
      if (child) {
        return child;
      }
    }
  }

  private addEntries(entries: Map<string, FSNode>, layer: FSNode) {
    this.entries(layer).forEach((child) =>
      entries.set(child.name, entries.get(child.name) ?? child),
    );
  }
  private directory(node: FSNode | undefined): node is FSNode {
    return Boolean(node?.dir);
  }
}
