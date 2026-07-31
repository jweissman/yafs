import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { FSNode } from './FSNode'
import { NodeStoreState } from './NodeStoreState'

export class NodeStoreResolver {
  constructor(private readonly state: NodeStoreState) {}

  get(path: AbsolutePath, follow = true, depth = 0): FSNode | undefined {
    if (depth > 40) throw new Error('Too many symbolic links')
    return path === '/' ? this.state.origin : this.traverse(path, follow, depth)
  }
  private traverse(path: AbsolutePath, follow: boolean, depth: number) {
    return this.find(this.state.origin, path.slice(1).split('/'), follow, depth)
  }

  child(node: FSNode, name: string): FSNode | undefined {
    return node.unionLayers ? this.layerChild(node.unionLayers, name)
      : node.children?.find(candidate => candidate.name === name)
  }

  entries(node: FSNode): FSNode[] {
    if (!node.unionLayers) return node.children || []
    const entries = new Map<string, FSNode>(); node.unionLayers.forEach(layer => this.addEntries(entries, layer))
    return [...entries.values()]
  }

  pathOf(node: FSNode): string {
    const names: string[] = []; let current: FSNode | undefined = node
    while (current?.parent) { names.unshift(current.name); current = current.parent }
    return `/${names.join('/')}`
  }

  resolveFrom(node: FSNode, parts: string[]) {
    return parts.reduce<FSNode | undefined>((current, part) => this.resolvePart(current, part), node)
  }
  private resolvePart(node: FSNode | undefined, part: string) { return node && this.child(node, part) }

  private find(node: FSNode, parts: string[], follow: boolean, depth: number): FSNode | undefined {
    const child = this.child(node, parts[0]); if (!child) return undefined
    if (child.symlinkTarget && (follow || parts.length > 1)) return this.follow(child, parts.slice(1), follow, depth)
    return parts.length === 1 ? child : this.find(child, parts.slice(1), follow, depth)
  }

  private follow(link: FSNode, rest: string[], final: boolean, depth: number) {
    const target = this.linkTarget(link); const path = rest.length ? `${target}/${rest.join('/')}` : target
    return this.get(PathResolver.resolve(path, '/'), final, depth + 1)
  }

  linkTarget(link: FSNode) {
    const target = link.symlinkTarget!
    return target.startsWith('/') ? target : `${this.pathOf(this.parent(link))}/${target}`
  }
  private parent(link: FSNode) { return link.parent || this.state.origin }

  private layerChild(layers: FSNode[], name: string): FSNode | undefined {
    for (const layer of layers) { const child = this.child(layer, name); if (child) return child }
  }

  private addEntries(entries: Map<string, FSNode>, layer: FSNode) {
    this.entries(layer).forEach(child => entries.set(child.name, entries.get(child.name) || child))
  }
}
