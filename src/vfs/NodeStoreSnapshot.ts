import { FSNode } from './FSNode'
import { NodeStoreMutation } from './NodeStoreMutation'
import { NodeStoreResolver } from './NodeStoreResolver'
import { NodeStoreState } from './NodeStoreState'
import { SnapshotNode, VfsSnapshot } from './Snapshot'
import { VfsOperation } from './VfsOperation'

export class NodeStoreSnapshot {
  constructor(private readonly state: NodeStoreState, private readonly mutate: NodeStoreMutation) {}
  validate(operations: VfsOperation[]) {
    const copy = this.copy(); copy.restore(this.snapshot(0)); operations.forEach(item => copy.mutate.apply(item))
  }

  private copy() {
    const state = new NodeStoreState(this.state.clock); const resolver = new NodeStoreResolver(state)
    return new NodeStoreSnapshot(state, new NodeStoreMutation(state, resolver))
  }
  snapshot(sequence: number): VfsSnapshot {
    return { version: 1, sequence, root: this.node(this.state.origin) }
  }
  restore(snapshot: VfsSnapshot) {
    this.state.nodes = { 1: this.restoreNode(snapshot.root, undefined) }; this.state.nextInode = 2
    this.index(this.state.origin)
  }
  private node(node: FSNode): SnapshotNode {
    return { name: node.name, dir: node.dir, content: node.content, symlinkTarget: node.symlinkTarget,
      ...this.nodeMetadata(node),
      children: node.children?.map(child => this.node(child)), unionLayers: node.unionLayers }
  }
  private nodeMetadata(node: FSNode) {
    return { providerOrigin: node.providerOrigin, createdAt: node.createdAt.toISOString(),
      modifiedAt: node.modifiedAt.toISOString() }
  }
  private restoreNode(data: SnapshotNode, parent: FSNode | undefined): FSNode {
    const node = this.restored(data, parent)
    this.restoreChildren(data, node); return node
  }
  private restoreChildren(data: SnapshotNode, node: FSNode) {
    node.children = data.children?.map(child => this.restoreNode(child, node))
  }
  private restored(data: SnapshotNode, parent: FSNode | undefined): FSNode {
    return { name: data.name, dir: data.dir, content: data.content, symlinkTarget: data.symlinkTarget,
      providerOrigin: data.providerOrigin, unionLayers: data.unionLayers,
      parent, createdAt: new Date(data.createdAt), modifiedAt: new Date(data.modifiedAt) }
  }
  private index(node: FSNode) {
    node.children?.forEach(child => { this.state.nodes[this.state.nextInode++] = child; this.index(child) })
  }
}
