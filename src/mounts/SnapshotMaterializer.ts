import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { NodeStore } from '../vfs/NodeStore'
import { providerFor } from './Provider'
import { MountRecord } from './types'

export class SnapshotMaterializer {
  constructor(private readonly store: NodeStore) {}

  materialize(record: MountRecord) {
    if (this.store.get(record.path, false)) return; this.store.mkdir(record.path)
    providerFor(record).entries().forEach(([path, content]) =>
      this.write(record.path, path, content))
  }

  remove(record: MountRecord) { this.store.removeTree(record.path) }

  private write(root: AbsolutePath, relative: string, content: string) {
    const path = PathResolver.resolve(relative, root)
    if (!path.startsWith(`${root}/`)) throw new Error(`Invalid fixture path: ${relative}`)
    this.parents(root, path); this.store.write(path, content)
  }

  private parents(root: AbsolutePath, path: AbsolutePath) {
    const parts = path.slice(root.length + 1).split('/'); parts.pop()
    parts.reduce<AbsolutePath>((parent, name) => this.directory(parent, name), root)
  }

  private directory(parent: AbsolutePath, name: string): AbsolutePath {
    const path = PathResolver.resolve(name, parent)
    if (!this.store.get(path, false)) this.store.mkdir(path)
    return path
  }
}
