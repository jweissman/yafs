import { AbsolutePath } from '../core/AbsolutePath'
import { VfsOperation } from '../vfs/VfsOperation'

export type CtlHandler = (payload: string) => Promise<void> | void

export class CtlDispatch {
  private readonly handlers: Map<AbsolutePath, CtlHandler>

  constructor(handlers = new Map<AbsolutePath, CtlHandler>()) { this.handlers = handlers }

  register(path: AbsolutePath, handler: CtlHandler) { this.handlers.set(path, handler) }
  unregister(path: AbsolutePath) { this.handlers.delete(path) }

  async intercept(operations: VfsOperation[]): Promise<VfsOperation[]> {
    const kept: VfsOperation[] = []
    for (const operation of operations) { if (!await this.dispatch(operation)) kept.push(operation) }
    return kept
  }

  private async dispatch(operation: VfsOperation): Promise<boolean> {
    if (operation.type !== 'write') return false
    const handler = this.handlers.get(operation.path); if (!handler) return false
    await handler(operation.content); return true
  }
}
