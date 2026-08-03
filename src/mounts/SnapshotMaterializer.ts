import { Buffer } from 'node:buffer'

import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { ProviderOrigin } from '../vfs/FSNode'
import { NodeStore } from '../vfs/NodeStore'
import { providerFor } from './Provider'
import { MountRecord, PreparedMountRecord, PublishedSnapshot } from './types'

export type SnapshotLimits = { files: number, bytes: number }

export const defaultSnapshotLimits: SnapshotLimits = { files: 4096, bytes: 1024 * 1024 }

export class SnapshotMaterializer {
  constructor(private readonly store: NodeStore, private readonly limits = defaultSnapshotLimits) {}

  prepare(record: MountRecord): PreparedMountRecord {
    const entries = providerFor(record).entries(); const snapshot = this.snapshot(entries)
    return { ...record, snapshot }
  }

  materialize(record: PreparedMountRecord) { this.publish(candidate => this.populate(candidate, record)) }
  replace(record: PreparedMountRecord) {
    this.publish(candidate => { candidate.removeTree(record.path); this.populate(candidate, record) })
  }
  remove(record: MountRecord) { this.publish(candidate => candidate.removeTree(record.path)) }
  exists(record: MountRecord) { return Boolean(this.store.get(record.path, false)) }

  private publish(change: (store: NodeStore) => void) {
    const candidate = this.candidate(); change(candidate); this.store.restore(candidate.snapshot(0))
  }
  private candidate() { const store = new NodeStore(); store.restore(this.store.snapshot(0)); return store }
  private populate(store: NodeStore, record: PreparedMountRecord) {
    store.mkdir(record.path); record.snapshot.entries.forEach(entry => this.write(store, record.path, entry))
    store.setProviderOrigin(record.path, this.origin(record))
  }
  private snapshot(entries: [string, string][]): PublishedSnapshot {
    const byteCount = this.byteCount(entries); this.assertWithinLimits(entries.length, byteCount)
    return { entries: entries.map(([path, content]) => [path, content]), fileCount: entries.length, byteCount }
  }
  private byteCount(entries: [string, string][]) { return entries.reduce(this.countBytes, 0) }
  private countBytes(count: number, [, content]: [string, string]) { return count + Buffer.byteLength(content) }
  private assertWithinLimits(fileCount: number, byteCount: number) {
    if (fileCount > this.limits.files) throw new Error(`Snapshot exceeds ${this.limits.files} files`)
    if (byteCount > this.limits.bytes) throw new Error(`Snapshot exceeds ${this.limits.bytes} bytes`)
  }
  private write(store: NodeStore, root: AbsolutePath, entry: [string, string]) {
    const [relative, content] = entry; const path = PathResolver.resolve(relative, root)
    if (!path.startsWith(`${root}/`)) throw new Error(`Invalid fixture path: ${relative}`)
    this.parents(store, root, path); store.write(path, content)
  }
  private parents(store: NodeStore, root: AbsolutePath, path: AbsolutePath) {
    const parts = path.slice(root.length + 1).split('/'); parts.pop()
    parts.reduce<AbsolutePath>((parent, name) => this.directory(store, parent, name), root)
  }
  private directory(store: NodeStore, parent: AbsolutePath, name: string): AbsolutePath {
    const path = PathResolver.resolve(name, parent)
    if (!store.get(path, false)) store.mkdir(path)
    return path
  }
  private origin(record: MountRecord): ProviderOrigin {
    return { mountId: record.id, provider: record.provider, revision: record.revision,
      activatedAt: record.activatedAt, readOnly: true }
  }
}
