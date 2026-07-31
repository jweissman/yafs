import { AbsolutePath } from '../core/AbsolutePath'
import { FSNode } from './FSNode'
import { NodeStoreMutation } from './NodeStoreMutation'
import { NodeStoreResolver } from './NodeStoreResolver'
import { NodeStoreState } from './NodeStoreState'
import { SnapshotNode, VfsSnapshot } from './Snapshot'
import { VfsOperation } from './VfsOperation'

export class NodeStoreSnapshot {
  constructor(private readonly state: NodeStoreState, private readonly resolver: NodeStoreResolver,
    private readonly mutate: NodeStoreMutation, private readonly copy: () => NodeStoreSnapshot) {}
  validate(operations: VfsOperation[]) {
    const copy = this.copy(); copy.restore(this.snapshot(0)); operations.forEach(item => copy.mutate.apply(item))
  }
  snapshot(sequence: number): VfsSnapshot {
    return { version: 1, sequence, root: this.node(this.state.origin) }
  }
  restore(snapshot: VfsSnapshot) {
    const pending: { node: FSNode, layers: string[] }[] = []
    this.state.nodes = { 1: this.restoreNode(snapshot.root, undefined, pending) }; this.state.nextInode = 2
    this.index(this.state.origin); this.restoreLayers(pending)
  }
  private restoreLayers(pending: { node: FSNode, layers: string[] }[]) {
    pending.forEach(item => item.node.unionLayers = item.layers.map(path => this.resolver.get(path as AbsolutePath)!))
  }
  private node(node: FSNode): SnapshotNode {
    return { name: node.name, dir: node.dir, content: node.content, symlinkTarget: node.symlinkTarget,
      createdAt: node.createdAt.toISOString(), modifiedAt: node.modifiedAt.toISOString(),
      children: node.children?.map(child => this.node(child)), unionLayers: this.layers(node) }
  }
  private layers(node: FSNode) { return node.unionLayers?.map(layer => this.resolver.pathOf(layer)) }
  private restoreNode(data: SnapshotNode, parent: FSNode | undefined,
    pending: { node: FSNode, layers: string[] }[]): FSNode {
    const node = this.restored(data, parent)
    this.restoreChildren(data, node, pending); this.pending(data, node, pending); return node
  }
  private restoreChildren(data: SnapshotNode, node: FSNode, pending: { node: FSNode, layers: string[] }[]) {
    node.children = data.children?.map(child => this.restoreNode(child, node, pending))
  }
  private pending(data: SnapshotNode, node: FSNode, pending: { node: FSNode, layers: string[] }[]) {
    if (data.unionLayers) pending.push({ node, layers: data.unionLayers })
  }
  private restored(data: SnapshotNode, parent: FSNode | undefined): FSNode {
    return { name: data.name, dir: data.dir, content: data.content, symlinkTarget: data.symlinkTarget,
      parent, createdAt: new Date(data.createdAt), modifiedAt: new Date(data.modifiedAt) }
  }
  private index(node: FSNode) {
    node.children?.forEach(child => { this.state.nodes[this.state.nextInode++] = child; this.index(child) })
  }
}
