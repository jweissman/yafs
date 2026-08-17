import { NodeStore } from "../vfs/NodeStore";
import { VfsOperation } from "../vfs/VfsOperation";
import { Journal } from "./Journal";

export class BackgroundCommit {
  constructor(
    private readonly store: NodeStore,
    private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
  ) {}

  commit(operations: VfsOperation[]): Promise<void> {
    return this.enqueue(() => this.apply(operations));
  }

  private async apply(operations: VfsOperation[]) {
    await this.journal.commit(operations);
    operations.forEach((operation) => {
      this.store.apply(operation);
    });
  }
}
