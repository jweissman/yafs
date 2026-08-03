import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { MountPersistence } from './MountPersistence'
import { MountPlanner } from './MountPlanner'
import { SnapshotLimits, SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, PreparedMountRecord } from './types'

export class MountManager {
  private records: PreparedMountRecord[] = []
  private readonly persistence: MountPersistence
  private readonly planner: MountPlanner
  private readonly snapshots: SnapshotMaterializer

  constructor(store: NodeStore, statePath?: string, auditPath?: string, limits?: SnapshotLimits) {
    this.persistence = new MountPersistence(statePath, auditPath)
    this.planner = this.createPlanner(store); this.snapshots = new SnapshotMaterializer(store, limits)
    this.records = this.persistence.restore()
  }

  private createPlanner(store: NodeStore) { return new MountPlanner(store, () => this.records) }

  validate(path: AbsolutePath) { return this.planner.validate(path) }
  planActivation(path: AbsolutePath, id?: string) { return this.planner.plan(path, id) }
  prepareActivation(record: MountRecord) { return this.snapshots.prepare(record) }
  prepareRefresh(path: AbsolutePath, id?: string) { return this.prepareActivation(this.planner.refresh(path, id)) }
  mounts() { return [...this.records] }

  activate(record: PreparedMountRecord, actor: string) {
    this.snapshots.materialize(record); this.records.push(record); this.save()
    this.persistence.audit(record, actor, 'activation', undefined, record.revision)
  }

  refresh(record: PreparedMountRecord, actor: string) {
    const previous = this.planUnmount(record.id)
    this.snapshots.replace(record); this.records = this.records.map(item => item.id === record.id ? record : item)
    this.save(); this.persistence.audit(record, actor, 'refresh', previous.revision, record.revision)
  }

  planUnmount(id: string): PreparedMountRecord {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error(`No active mount: ${id}`)
    return record
  }

  unmount(id: string, actor: string) {
    const record = this.planUnmount(id)
    this.remove(record)
    this.persistence.audit(record, actor, 'unmount', record.revision)
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
  private includes(record: MountRecord) {
    return this.records.some(item => item.id === record.id && item.path === record.path)
  }
  private remove(record: MountRecord) {
    this.snapshots.remove(record); this.records = this.records.filter(item => item !== record)
    this.save()
  }
}
