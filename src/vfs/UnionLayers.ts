import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { NodeStoreResolver } from './NodeStoreResolver'

export function canonicalUnionLayers(resolver: NodeStoreResolver, layers: AbsolutePath[]) {
  const resolved = layers.map(layer => PathResolver.resolve(layer, '/'))
  resolved.forEach(path => assertDirectory(resolver, path)); return resolved
}

function assertDirectory(resolver: NodeStoreResolver, path: AbsolutePath) {
  if (!resolver.get(path)?.dir) throw new Error(`Union layer is not a directory: ${path}`)
}
