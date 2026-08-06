import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { ManifestMount, PreparedMountRecord } from './types'

export type Change = { id: string, action: 'activate' | 'refresh' | 'unmount' }

export class DesiredMountChanges {
  constructor(private readonly root: AbsolutePath) {}

  plan(active: PreparedMountRecord[], declared: ManifestMount[], prune = false): Change[] {
    this.assertUnique(declared)
    return [...this.declaredChanges(declared, active), ...this.removals(declared, active, prune)]
  }

  private assertUnique(declared: ManifestMount[]) {
    if (new Set(declared.map(item => item.id)).size !== declared.length) throw new Error('Duplicate desired mount id')
  }

  private declaredChanges(declared: ManifestMount[], active: PreparedMountRecord[]): Change[] {
    return declared.flatMap(item => this.change(item, active.find(record => record.id === item.id)))
  }

  private change(item: ManifestMount, active: PreparedMountRecord | undefined): Change[] {
    if (!active) return [{ id: item.id, action: 'activate' }]
    return this.matches(item, active) ? [] : [{ id: item.id, action: 'refresh' }]
  }

  private matches(item: ManifestMount, active: PreparedMountRecord) {
    return JSON.stringify(this.activeShape(active)) === JSON.stringify(this.declaredShape(item))
  }

  private activeShape(record: PreparedMountRecord) {
    return [record.path, record.provider, record.config, record.capabilities, record.refreshIntervalMs]
  }

  private declaredShape(item: ManifestMount) {
    return [PathResolver.resolve(item.path, this.root), item.provider, item.config,
      item.capabilities, item.refreshIntervalMs]
  }

  private removals(declared: ManifestMount[], active: PreparedMountRecord[], prune: boolean): Change[] {
    if (!prune) return []
    return active.filter(record => !declared.some(item => item.id === record.id))
      .map(record => ({ id: record.id, action: 'unmount' as const }))
  }
}
