import { Clock, systemClock } from "../core/Clock";
import { FSNode } from "./FSNode";

export class NodeStoreState {
  nodes: { [inode: number]: FSNode } = {
    1: {
      name: "/",
      dir: true,
      children: [],
      createdAt: new Date(0),
      modifiedAt: new Date(0),
    },
  };
  nextInode = 2;

  constructor(readonly clock: Clock = systemClock) {}

  get origin() {
    return this.nodes[1];
  }

  createNode(
    name: string,
    dir: boolean,
    parent: FSNode,
    at = this.clock.now(),
  ) {
    const node = this.node(name, dir, parent, at);
    this.index(node);
    this.attach(parent, node);
    return node;
  }

  private node(name: string, dir: boolean, parent: FSNode, at: Date): FSNode {
    return {
      name,
      dir,
      children: dir ? [] : undefined,
      parent,
      createdAt: at,
      modifiedAt: at,
    };
  }
  private index(node: FSNode) {
    this.nodes[this.nextInode++] = node;
  }
  private attach(parent: FSNode, node: FSNode) {
    parent.children ||= [];
    parent.children.push(node);
  }
}
