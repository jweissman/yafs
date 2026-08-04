import { AbsolutePath } from '../core/AbsolutePath'
import { VfsOperation } from '../vfs/VfsOperation'

export type CtlHandler = (payload: string) => Promise<void> | void

export class CtlDispatch {
  private readonly handlers: Map<AbsolutePath, CtlHandler>

  constructor(handlers = new Map<AbsolutePath, CtlHandler>()) { this.handlers = handlers }

  register(path: AbsolutePath, handler: CtlHandler) { this.handlers.set(path, handler) }
  unregister(path: AbsolutePath) { this.handlers.delete(path) }

  intercept(operations: VfsOperation[]): VfsOperation[] {
    return operations.filter(operation => !this.dispatch(operation))
  }

  private dispatch(operation: VfsOperation): boolean {
    if (operation.type !== 'write') return false
    const handler = this.handlers.get(operation.path); if (!handler) return false
    void this.run(handler, operation.content, operation.path); return true
  }

  private async run(handler: CtlHandler, payload: string, path: AbsolutePath) {
    try { await handler(payload) } catch (error) { console.error(`ctl handler failed for ${path}:`, error) }
  }
}
