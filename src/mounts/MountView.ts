import { dirname } from 'node:path'

import { AbsolutePath } from '../core/AbsolutePath'
import { providerFor } from './Provider'
import { MountRecord, Provenance } from './types'

type Match = { record: MountRecord, relative: string }

export class MountView {
  constructor(private readonly records: () => MountRecord[]) {}

  read(path: AbsolutePath) {
    const match = this.match(path)
    return match && providerFor(match.record).read(match.relative)
  }

  list(path: AbsolutePath, local: string[]) {
    const match = this.match(path)
    if (match) return providerFor(match.record).list(match.relative)
    return [...local, ...this.children(path).filter(name => !local.includes(name))]
  }

  type(path: AbsolutePath) {
    const match = this.match(path)
    return match ? this.providerType(match) : this.directory(path)
  }

  provenance(path: AbsolutePath): Provenance[] | undefined {
    const match = this.match(path)
    if (!match) return undefined
    return [this.providerOrigin(path, match.record)]
  }

  private providerType(match: Match) {
    return providerFor(match.record).type(match.relative)
  }

  private providerOrigin(path: AbsolutePath, record: MountRecord): Provenance {
    return { kind: 'provider', path, mountId: record.id, provider: record.provider,
      revision: record.revision, activatedAt: record.activatedAt }
  }

  assertWritable(path: AbsolutePath) {
    if (this.match(path)) throw new Error(`Read-only mount: ${path}`)
  }

  private directory(path: AbsolutePath) {
    return this.children(path).length ? 'directory' as const : undefined
  }

  private children(path: AbsolutePath) {
    return this.records().filter(record => dirname(record.path) === path)
      .map(record => record.path.split('/').at(-1)!)
  }

  private match(path: AbsolutePath): Match | undefined {
    const record = this.matchingRecord(path)
    return record && { record, relative: path.slice(record.path.length).replace(/^\//, '') }
  }

  private matchingRecord(path: AbsolutePath) {
    return [...this.records()].sort((left, right) => right.path.length - left.path.length)
      .find(item => path === item.path || path.startsWith(`${item.path}/`))
  }
}
