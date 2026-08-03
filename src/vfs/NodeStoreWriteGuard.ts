import { AbsolutePath } from '../core/AbsolutePath'
import { FSNode, ProviderOrigin } from './FSNode'

export const nodeStoreWriteGuard = {
  assertWritable(node: FSNode, path: AbsolutePath) {
    if (node.providerOrigin?.readOnly) throw new Error(`Read-only mount: ${path}`)
    if (node.unionLayers) throw new Error(`Read-only union mount: ${path}`)
  },
  setProviderOrigin(node: FSNode, origin: ProviderOrigin) {
    node.providerOrigin = origin
    for (const child of node.children || []) this.setProviderOrigin(child, origin)
  }
}
