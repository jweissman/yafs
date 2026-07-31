import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { MountPersistence } from './MountPersistence'
import { MountPlanner } from './MountPlanner'
import { SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, Provenance } from './types'
import { MountView } from './MountView'

export class MountManager {
  private records: MountRecord[] = []
  private readonly persistence: MountPersistence
  private readonly planner: MountPlanner
  private readonly snapshots: SnapshotMaterializer
  private readonly view: MountView

  constructor(store: NodeStore, statePath?: string, auditPath?: string) {
    this.persistence = new MountPersistence(statePath, auditPath)
    this.planner = this.createPlanner(store); this.snapshots = new SnapshotMaterializer(store)
    this.view = new MountView(() => this.records); this.records = this.persistence.restore()
  }

  private createPlanner(store: NodeStore) { return new MountPlanner(store, () => this.records) }

  validate(path: AbsolutePath) { return this.planner.validate(path) }
  planActivation(path: AbsolutePath, id?: string) { return this.planner.plan(path, id) }
  read(path: AbsolutePath) { return this.view.read(path) }
  list(path: AbsolutePath, local: string[]) { return this.view.list(path, local) }
  type(path: AbsolutePath) { return this.view.type(path) }
  provenance(path: AbsolutePath): Provenance[] | undefined { return this.view.provenance(path) }
  assertWritable(path: AbsolutePath) { this.view.assertWritable(path) }
  mounts() { return [...this.records] }

  activate(record: MountRecord, actor: string) {
    this.snapshots.materialize(record); this.records.push(record); this.save()
    this.persistence.audit(record, actor, 'activation', undefined, record.revision)
  }

  planUnmount(id: string) {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error(`No active mount: ${id}`)
    return record
  }

  unmount(id: string, actor: string) {
    const record = this.planUnmount(id)
    this.remove(record)
    this.persistence.audit(record, actor, 'unmount', record.revision)
  }

  restoreOperation(record: MountRecord) {
    this.snapshots.materialize(record)
    if (!this.includes(record)) { this.records.push(record); this.save() }
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
