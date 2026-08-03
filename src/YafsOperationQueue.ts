import { Clock } from './core/Clock'
import { MountManager } from './mounts/MountManager'
import { NodeStore } from './vfs/NodeStore'
import { VfsIntent, VfsOperation } from './vfs/VfsOperation'

export class YafsOperationQueue {
  private operations: VfsOperation[] = []

  constructor(private readonly store: NodeStore, private readonly mounts: MountManager,
    private readonly clock: Clock, private readonly actor: () => string) {}

  reset() { this.operations = [] }
  all() { return this.operations }
  count() { return this.operations.length }
  restore(count: number) { this.operations.length = count }
  validate() { this.store.validate(this.operations) }

  add(operation: VfsIntent) {
    this.operations.push({ ...operation, at: this.clock.now().toISOString() } as VfsOperation)
  }

  apply(operations = this.operations) { operations.forEach(operation => this.applyOperation(operation)) }

  private applyOperation(operation: VfsOperation) {
    if (operation.type === 'mount') return this.mounts.activate(operation.record, this.actor())
    return this.applyNonMount(operation)
  }
  private applyNonMount(operation: VfsOperation) {
    if (operation.type === 'refresh') return this.mounts.refresh(operation.record, this.actor())
    if (operation.type === 'unmount') return this.mounts.unmount(operation.id, this.actor())
    return this.store.apply(operation)
  }
}
