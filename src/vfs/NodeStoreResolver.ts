import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { FSNode } from "./FSNode";
import { linkTarget as targetFor } from "./NodeStoreLinkTarget";
import { NodeStoreState } from "./NodeStoreState";
import { NodeStoreUnion } from "./NodeStoreUnion";

export class NodeStoreResolver {
  private readonly union: NodeStoreUnion;

  constructor(private readonly state: NodeStoreState) {
    this.union = new NodeStoreUnion((path) => this.get(path));
  }

  get(path: AbsolutePath, follow = true, depth = 0): FSNode | undefined {
    if (depth > 40) {
      throw new Error("Too many symbolic links");
    }
    return path === "/"
      ? this.state.origin
      : this.traverse(path, follow, depth);
  }
  private traverse(path: AbsolutePath, follow: boolean, depth: number) {
    return this.find(
      this.state.origin,
      path.slice(1).split("/"),
      follow,
      depth,
    );
  }

  child(node: FSNode, name: string): FSNode | undefined {
    return this.union.child(node, name);
  }

  entries(node: FSNode): FSNode[] {
    return this.union.entries(node);
  }

  layers(node: FSNode): FSNode[] {
    return this.union.layers(node);
  }

  pathOf(node: FSNode): string {
    const names: string[] = [];
    let current = node;
    while (current.parent) {
      names.unshift(current.name);
      current = current.parent;
    }
    return `/${names.join("/")}`;
  }

  resolveFrom(node: FSNode, parts: string[]) {
    return parts.reduce<FSNode | undefined>(
      (current, part) => this.resolvePart(current, part),
      node,
    );
  }
  private resolvePart(node: FSNode | undefined, part: string) {
    return node && this.child(node, part);
  }

  private find(
    node: FSNode,
    parts: string[],
    follow: boolean,
    depth: number,
  ): FSNode | undefined {
    const child = this.child(node, parts[0]);
    return child ? this.resolved(child, parts, follow, depth) : undefined;
  }
  private resolved(
    child: FSNode,
    parts: string[],
    follow: boolean,
    depth: number,
  ) {
    return this.shouldFollow(child, parts, follow)
      ? this.follow(child, parts.slice(1), follow, depth)
      : this.descend(child, parts, follow, depth);
  }

  private shouldFollow(child: FSNode, parts: string[], follow: boolean) {
    return Boolean(child.symlinkTarget) && (follow || parts.length > 1);
  }
  private descend(
    child: FSNode,
    parts: string[],
    follow: boolean,
    depth: number,
  ) {
    return parts.length === 1
      ? child
      : this.find(child, parts.slice(1), follow, depth);
  }

  private follow(link: FSNode, rest: string[], final: boolean, depth: number) {
    const target = this.linkTarget(link);
    const path = rest.length ? `${target}/${rest.join("/")}` : target;
    return this.get(PathResolver.resolve(path, "/"), final, depth + 1);
  }

  linkTarget(link: FSNode) {
    return targetFor(link, this.state.origin, (node) =>
      this.pathOf(node),
    );
  }
}
