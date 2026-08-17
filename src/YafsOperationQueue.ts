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
    const queued = {
      ...operation,
      at: this.clock.now().toISOString(),
    };
    this.operations.push(queued);
    return queued;
  }
  afterCommit(effect: () => void) {
    this.afterApply.push(effect);
    return effect;
  }

  apply(operations = this.operations) {
    operations.forEach((operation) => {
      this.applyOperation(operation);
    });
    this.runAfterApply();
  }

  private runAfterApply() {
    this.afterApply.forEach((effect) => {
      effect();
    });
    this.afterApply = [];
  }

  private applyOperation(operation: VfsOperation) {
    if (operation.type === "mount") {
      this.mounts.activate(operation.record, this.actor());
      return;
    }
    this.applyNonMount(operation);
  }
  private applyNonMount(operation: VfsOperation) {
    const lifecycle = this.lifecycleOperation(operation);
    if (lifecycle) {
      lifecycle();
      return;
    }
    this.store.apply(operation);
  }
  private lifecycleOperation(operation: VfsOperation) {
    if (operation.type === "refresh") {
      return () => this.applyRefresh(operation);
    }
    if (operation.type === "unmount") {
      return () => this.applyUnmount(operation);
    }
  }
  private applyRefresh(operation: Extract<VfsOperation, { type: "refresh" }>) {
    this.mounts.refresh(operation.record, this.actor());
    return operation;
  }
  private applyUnmount(operation: Extract<VfsOperation, { type: "unmount" }>) {
    this.mounts.unmount(operation.id, this.actor());
    return operation;
  }
}
