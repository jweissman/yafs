import { createServer, type Server, type Socket } from 'node:net'

import Yafs from '../index'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { ProviderRegistry } from '../mounts/ProviderRegistry'
import { MountRefreshScheduler } from '../mounts/MountRefreshScheduler'
import { openServices, listen } from './ServerServices'
import { attachLines, isWriteRequest, parseRequest, persistenceFailure, requestFailure, respond,
  Request } from './Framing'

export type StartOptions = {
  walPath?: string, dataDir?: string, port?: number, host?: string, providers?: ProviderRegistry,
  now?: () => number
}

export class YafsServer {
  private readonly server: Server
  private queue: Promise<void> = Promise.resolve()
  private sockets = new Set<Socket>()
  private readonly scheduler: MountRefreshScheduler
  private refreshTimer?: Timer

  private constructor(private readonly store: NodeStore, private readonly journal: Journal,
    private readonly mounts: MountManager, now?: () => number) {
    this.server = createServer(socket => this.accept(socket))
    this.scheduler = new MountRefreshScheduler(() => this.mounts.mounts(), record => this.enqueueRefresh(record), now)
  }

  static async start(options: StartOptions): Promise<YafsServer> {
    const services = await openServices(options)
    const yafsServer = new YafsServer(services.store, services.journal, services.mounts, options.now)
    await listen(yafsServer.server, options); yafsServer.startRefreshTimer(); return yafsServer
  }

  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Server is not listening')
    return { host: address.address, port: address.port }
  }

  async close(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    this.closeSockets(); await this.closeNetwork(); await this.journal.close()
  }

  private closeSockets() { for (const socket of this.sockets) socket.destroy() }

  private closeNetwork() {
    return new Promise<void>((resolve, reject) =>
      this.server.close(error => { if (error) reject(error); else resolve() }))
  }

  private accept(socket: Socket) {
    this.observe(socket)
    this.attachSession(socket, new Yafs({ store: this.store, mounts: this.mounts }))
  }

  private observe(socket: Socket) {
    this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }

  private attachSession(socket: Socket, session: Yafs) {
    socket.setEncoding('utf8')
    attachLines(socket, line => this.enqueue(session, line, socket))
  }

  private enqueue(session: Yafs, line: string, socket: Socket) {
    this.queue = this.queue.then(() => this.executeLine(session, line, socket))
      .catch(() => { socket.destroy() })
  }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = this.requestOrClose(line, socket); if (!request) return
    try { await this.executeRequest(session, request, socket) }
    catch (error) { respond(socket, persistenceFailure(request.id, error)) }
  }

  private async executeRequest(session: Yafs, request: Request, socket: Socket) {
    const plan = await this.plan(session, request)
    await this.commit(session, plan.operations)
    respond(socket, { version: 1, id: request.id, result: plan.result })
  }

  private plan(session: Yafs, request: Request) {
    return isWriteRequest(request) ? session.planWrite(request.write.path, request.write.content)
      : session.planAsync(request.command)
  }

  private requestOrClose(line: string, socket: Socket): Request | undefined {
    try { return parseRequest(line) } catch (error) { return this.rejectRequest(error, socket) }
  }

  private rejectRequest(error: unknown, socket: Socket): undefined {
    const failure = requestFailure(error)
    if (failure) { respond(socket, failure); return undefined }
    socket.destroy(); return undefined
  }

  private async commit(session: Yafs, operations: VfsOperation[]) {
    await this.journal.commit(operations); session.apply(operations)
    try { await this.journal.compact(this.store) } catch (error) { console.error('Journal compaction failed:', error) }
  }

  async refreshDue() { return this.scheduler.tick() }
  private startRefreshTimer() {
    this.refreshTimer = setInterval(() => void this.refreshDue().catch(console.error), 60_000)
  }

  private enqueueRefresh(record: import('../mounts/types').PreparedMountRecord) {
    this.queue = this.queue.then(() => this.refresh(record)); return this.queue
  }
  private async refresh(record: import('../mounts/types').PreparedMountRecord) {
    const prepared = await this.mounts.prepareRefresh(record.manifestPath, record.id, 'system')
    await this.journal.commit([{ type: 'refresh', record: prepared, at: new Date().toISOString() }])
    this.mounts.refresh(prepared, 'system')
  }
}
