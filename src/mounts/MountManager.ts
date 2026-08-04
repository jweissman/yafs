import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { MountPersistence } from './MountPersistence'
import { MountPlanner } from './MountPlanner'
import { SnapshotLimits, SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, PreparedMountRecord } from './types'
import { ProviderRegistry } from './ProviderRegistry'

export class MountManager {
  private records: PreparedMountRecord[] = []
  private readonly persistence: MountPersistence
  private readonly planner: MountPlanner
  private readonly snapshots: SnapshotMaterializer

  constructor(store: NodeStore, statePath?: string, auditPath?: string, limits?: SnapshotLimits,
    private readonly providers = new ProviderRegistry()) {
    this.persistence = this.persistenceFor(statePath, auditPath); this.records = this.restore()
    this.planner = this.createPlanner(store); this.snapshots = new SnapshotMaterializer(store, limits)
  }

  private persistenceFor(statePath?: string, auditPath?: string) { return new MountPersistence(statePath, auditPath) }
  private restore() { return this.persistence.restore() }

  private createPlanner(store: NodeStore) { return new MountPlanner(store, () => this.records, this.providers) }

  validate(path: AbsolutePath) { return this.planner.validate(path) }
  planActivation(path: AbsolutePath, id?: string) { return this.planner.plan(path, id) }
  prepareActivation(record: MountRecord, actor = 'system') {
    if (record.capabilities.length) this.persistence.audit(record, actor, 'fetch', { outcome: 'started' })
    return this.prepared(record, actor)
  }
  prepareRefresh(path: AbsolutePath, id?: string, actor?: string) {
    return this.prepareActivation(this.planner.refresh(path, id), actor)
  }
  mounts() { return [...this.records] }
  resourceReference(path: AbsolutePath) {
    const record = this.records.find(item => path.startsWith(`${item.path}/`))
    return record?.snapshot.resourceReferences?.[path.slice(record.path.length + 1)]
  }

  activate(record: PreparedMountRecord, actor: string) {
    this.snapshots.materialize(record); this.records.push(record); this.save()
    this.persistence.audit(record, actor, 'activation', { outcome: 'success', after: record.revision })
  }

  refresh(record: PreparedMountRecord, actor: string) {
    const previous = this.planUnmount(record.id)
    this.snapshots.replace(record); this.records = this.records.map(item => item.id === record.id ? record : item)
    this.save(); this.persistence.audit(record, actor, 'refresh', { outcome: 'success', before: previous.revision, after: record.revision })
  }

  planUnmount(id: string): PreparedMountRecord {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error(`No active mount: ${id}`)
    return record
  }

  unmount(id: string, actor: string) {
    const record = this.planUnmount(id)
    this.remove(record)
    this.persistence.audit(record, actor, 'unmount', { outcome: 'success', before: record.revision })
  }

  restoreOperation(record: PreparedMountRecord) {
    if (!this.snapshots.exists(record)) this.snapshots.materialize(record)
    if (!this.includes(record)) { this.records.push(record); this.save() }
  }

  restoreRefresh(record: PreparedMountRecord) {
    this.snapshots.replace(record)
    this.records = this.records.map(item => item.id === record.id ? record : item); this.save()
  }

  restoreUnmount(id: string) {
    const record = this.records.find(item => item.id === id)
    if (record) this.snapshots.remove(record)
    this.records = this.records.filter(item => item.id !== id); this.save()
  }

  private save() { this.persistence.save(this.records) }
  private prepared(record: MountRecord, actor: string) {
    const prepared = this.providers.prepare(record, this.snapshots)
    return prepared instanceof Promise ? prepared.catch(error => this.fetchFailed(record, actor, error)) : prepared
  }
  private fetchFailed(record: MountRecord, actor: string, error: unknown): never {
    this.persistence.audit(record, actor, 'fetch', { outcome: 'failed', detail: detail(error) }); throw error
  }
  private includes(record: MountRecord) {
    return this.records.some(item => item.id === record.id && item.path === record.path)
  }
  private remove(record: MountRecord) {
    this.snapshots.remove(record); this.records = this.records.filter(item => item !== record)
    this.save()
  }
}

function detail(error: unknown) { return error instanceof Error ? error.message : String(error) }
