import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { FSNode } from "./FSNode";
import { nodeStoreWriteGuard } from "./NodeStoreWriteGuard";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";

type Walk = { parts: string[]; path: AbsolutePath; depth: number };

export class NodeStoreWritability {
  private readonly guard = nodeStoreWriteGuard;
  constructor(
    private readonly state: NodeStoreState,
    private readonly resolver: NodeStoreResolver,
  ) {}

  assertWritable(path: AbsolutePath, depth = 0) {
    if (depth > 40) {
      throw new Error("Too many symbolic links");
    }
    const parts = path.slice(1).split("/");
    this.writable(this.state.origin, { parts, path, depth });
  }

  private writable(node: FSNode, walk: Walk) {
    this.guard.assertWritable(node, walk.path);
    this.writableChildIfFound(node, walk);
  }

  private writableChildIfFound(node: FSNode, walk: Walk) {
    const child = node.children?.find((item) => item.name === walk.parts[0]);
    if (child) {
      this.writableChild(child, walk);
    }
  }

  private writableChild(child: FSNode, walk: Walk) {
    if (child.symlinkTarget) {
      return this.writableLink(child, walk.parts.slice(1), walk.depth);
    }
    this.writableDescendant(child, walk);
  }

  private writableDescendant(child: FSNode, walk: Walk) {
    if (walk.parts.length > 1) {
      const rest = { ...walk, parts: walk.parts.slice(1) };
      return this.writable(child, rest);
    }
    this.guard.assertWritable(child, walk.path);
  }

  private writableLink(link: FSNode, rest: string[], depth: number) {
    const target = this.resolver.linkTarget(link);
    const path = rest.length ? `${target}/${rest.join("/")}` : target;
    this.assertWritable(PathResolver.resolve(path, "/"), depth + 1);
  }
}
