import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { FSNode } from './FSNode'
import { NodeStoreResolver } from './NodeStoreResolver'
import { NodeStoreState } from './NodeStoreState'
import { VfsOperation } from './VfsOperation'

export class NodeStoreMutation {
  constructor(private readonly state: NodeStoreState, private readonly resolver: NodeStoreResolver) {}

  mkdir(path: AbsolutePath, at = this.state.clock.now()) { this.create(path, true, at) }
  touch(path: AbsolutePath, at = this.state.clock.now()) {
    this.assertWritable(path); const existing = this.resolver.get(path)
    if (existing) { existing.modifiedAt = at; return }
    this.create(path, false, at)
  }
  write(path: AbsolutePath, content: string, at = this.state.clock.now()) {
    this.assertWritable(path); const node = this.resolver.get(path)
    if (node) return this.replace(node, path, content, at)
    this.state.createNode(this.parent(path).name, false, this.parent(path).parent, at).content = content
  }
  remove(path: AbsolutePath) {
    this.assertWritable(path); const { parent, name } = this.parent(path)
    this.removeChild(parent, name, path)
  }
  private removeChild(parent: FSNode, name: string, path: AbsolutePath) {
    const index = parent.children?.findIndex(child => child.name === name) ?? -1
    if (index < 0) throw new Error(`No such file: ${path}`); this.assertFile(parent.children![index], path)
    parent.children!.splice(index, 1)
  }
  private assertFile(node: FSNode, path: AbsolutePath) { if (node.dir) throw new Error(`Is a directory: ${path}`) }
  removeTree(path: AbsolutePath) {
    const { parent, name } = this.parent(path)
    const index = parent.children?.findIndex(child => child.name === name) ?? -1
    if (index >= 0) parent.children!.splice(index, 1)
  }
  symlink(target: string, path: AbsolutePath, at = this.state.clock.now()) {
    const { parent, name } = this.parent(path); this.assertAbsent(parent, name, path)
    this.state.createNode(name, false, parent, at).symlinkTarget = target
  }
  union(path: AbsolutePath, layers: AbsolutePath[], at = this.state.clock.now()) {
    const { parent, name } = this.parent(path); this.assertAbsent(parent, name, path)
    this.state.createNode(name, true, parent, at).unionLayers = layers.map(layer => this.layer(layer))
  }
  apply(operation: VfsOperation) {
    if (operation.type === 'mount' || operation.type === 'unmount') return
    const at = new Date(operation.at); return this.applyAt(operation, at)
  }
  private applyAt(operation: Exclude<VfsOperation, { type: 'mount' | 'unmount' }>, at: Date) {
    if (operation.type === 'mkdir') return this.mkdir(operation.path, at)
    if (operation.type === 'touch') return this.touch(operation.path, at)
    return this.applyWrite(operation, at)
  }
  private applyWrite(operation: Exclude<VfsOperation, { type: 'mount' | 'unmount' | 'mkdir' | 'touch' }>, at: Date) {
    if (operation.type === 'write') return this.write(operation.path, operation.content, at)
    if (operation.type === 'symlink') return this.symlink(operation.target, operation.path, at)
    return operation.type === 'union' ? this.union(operation.path, operation.layers, at) : this.remove(operation.path)
  }
  private create(path: AbsolutePath, dir: boolean, at: Date) {
    this.assertWritable(path); const { parent, name } = this.parent(path); this.assertAbsent(parent, name, path)
    this.state.createNode(name, dir, parent, at)
  }
  private replace(node: FSNode, path: AbsolutePath, content: string, at: Date) {
    if (node.dir) throw new Error(`Is a directory: ${path}`); node.content = content; node.modifiedAt = at
  }
  private parent(path: AbsolutePath) {
    const parts = path.slice(1).split('/'); const name = parts.pop(); const parentPath = `/${parts.join('/')}` as AbsolutePath
    return this.checkedParent(this.resolver.get(parentPath), name, parentPath)
  }
  private checkedParent(parent: FSNode | undefined, name: string | undefined, path: AbsolutePath) {
    if (!name || !parent) throw new Error(`No such parent directory: ${path}`)
    if (!parent.dir) throw new Error(`Not a directory: ${path}`); if (parent.unionLayers) throw new Error(`Read-only union mount: ${path}`)
    return { parent, name }
  }
  private layer(path: AbsolutePath) { const node = this.resolver.get(path); if (!node?.dir) throw new Error(`Union layer is not a directory: ${path}`); return node }
  private assertAbsent(parent: FSNode, name: string, path: AbsolutePath) { if (parent.children?.some(child => child.name === name)) throw new Error(`Path already exists: ${path}`) }
  private assertWritable(path: AbsolutePath, depth = 0) {
    if (depth > 40) throw new Error('Too many symbolic links'); this.writable(this.state.origin, path.slice(1).split('/'), path, depth)
  }
  private writable(node: FSNode, parts: string[], path: AbsolutePath, depth: number) {
    if (node.unionLayers) throw new Error(`Read-only union mount: ${path}`)
    const child = node.children?.find(item => item.name === parts[0]); if (!child) return
    this.writableChild(child, parts, path, depth)
  }
  private writableChild(child: FSNode, parts: string[], path: AbsolutePath, depth: number) {
    if (child.symlinkTarget) return this.writableLink(child, parts.slice(1), depth)
    if (parts.length > 1) return this.writable(child, parts.slice(1), path, depth)
    if (child.unionLayers) throw new Error(`Read-only union mount: ${path}`)
  }
  private writableLink(link: FSNode, rest: string[], depth: number) { const target = this.resolver.linkTarget(link); const path = rest.length ? `${target}/${rest.join('/')}` : target; this.assertWritable(PathResolver.resolve(path, '/'), depth + 1) }
}
