import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { FSNode } from './FSNode'
import { nodeStoreWriteGuard } from './NodeStoreWriteGuard'
import { NodeStoreResolver } from './NodeStoreResolver'
import { NodeStoreState } from './NodeStoreState'

export class NodeStoreWritability {
  private readonly guard = nodeStoreWriteGuard
  constructor(private readonly state: NodeStoreState, private readonly resolver: NodeStoreResolver) {}

  assertWritable(path: AbsolutePath, depth = 0) {
    if (depth > 40) throw new Error('Too many symbolic links')
    this.writable(this.state.origin, path.slice(1).split('/'), path, depth)
  }

  private writable(node: FSNode, parts: string[], path: AbsolutePath, depth: number) {
    this.guard.assertWritable(node, path)
    const child = node.children?.find(item => item.name === parts[0]); if (!child) return
    this.writableChild(child, parts, path, depth)
  }

  private writableChild(child: FSNode, parts: string[], path: AbsolutePath, depth: number) {
    if (child.symlinkTarget) return this.writableLink(child, parts.slice(1), depth)
    if (parts.length > 1) return this.writable(child, parts.slice(1), path, depth)
    this.guard.assertWritable(child, path)
  }

  private writableLink(link: FSNode, rest: string[], depth: number) {
    const target = this.resolver.linkTarget(link); const path = rest.length ? `${target}/${rest.join('/')}` : target
    this.assertWritable(PathResolver.resolve(path, '/'), depth + 1)
  }
}
