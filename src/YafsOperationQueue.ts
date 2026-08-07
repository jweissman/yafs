import { Clock } from "./core/Clock";
import { MountManager } from "./mounts/MountManager";
import { NodeStore } from "./vfs/NodeStore";
import { VfsIntent, VfsOperation } from "./vfs/VfsOperation";

export class YafsOperationQueue {
  private operations: VfsOperation[] = [];
  private afterApply: (() => void)[] = [];

  constructor(
    private readonly store: NodeStore,
    private readonly mounts: MountManager,
    private readonly clock: Clock,
    private readonly actor: () => string,
  ) {}

  reset() {
    this.operations = [];
    this.afterApply = [];
  }
  all() {
    return this.operations;
  }
  count() {
    return {
      operations: this.operations.length,
      effects: this.afterApply.length,
    };
  }
  restore(count: { operations: number; effects: number }) {
    this.operations.length = count.operations;
    this.afterApply.length = count.effects;
  }
  validate() {
    this.store.validate(this.operations);
  }

  add(operation: VfsIntent) {
    this.operations.push({
      ...operation,
      at: this.clock.now().toISOString(),
    } as VfsOperation);
  }
  afterCommit(effect: () => void) {
    this.afterApply.push(effect);
  }

  apply(operations = this.operations) {
    operations.forEach((operation) => this.applyOperation(operation));
    this.runAfterApply();
  }

  private runAfterApply() {
    this.afterApply.forEach((effect) => effect());
    this.afterApply = [];
  }

  private applyOperation(operation: VfsOperation) {
    if (operation.type === "mount") {
      return this.mounts.activate(operation.record, this.actor());
    }
    return this.applyNonMount(operation);
  }
  private applyNonMount(operation: VfsOperation) {
    if (operation.type === "refresh") {
      return this.mounts.refresh(operation.record, this.actor());
    }
    if (operation.type === "unmount") {
      return this.mounts.unmount(operation.id, this.actor());
    }
    return this.store.apply(operation);
  }
}
