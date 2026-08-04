import { createServer, type Server, type Socket } from 'node:net'

import Yafs from '../index'
import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { ProviderRegistry } from '../mounts/ProviderRegistry'
import { openServices, listen } from './ServerServices'
import { attachLines, isWriteRequest, persistenceFailure, requestOrReject, respond, Request } from './Framing'
import { TraceReifier, TraceService } from '../traces/TraceService'
import { ServerRefresh } from './ServerRefresh'
import { CtlDispatch, CtlHandler } from './CtlDispatch'
import { BackgroundCommit } from './BackgroundCommit'
import { FixtureStreamDriver } from '../mounts/FixtureStreamDriver'

export type StartOptions = {
  walPath?: string, dataDir?: string, port?: number, host?: string, providers?: ProviderRegistry,
  now?: () => number, traceReifier?: TraceReifier
}

export class YafsServer {
  private readonly server: Server
  private queue: Promise<void> = Promise.resolve()
  private sockets = new Set<Socket>()
  private readonly refreshes: ServerRefresh
  private readonly streams: FixtureStreamDriver
  private readonly ctl = new CtlDispatch()

  private constructor(private readonly store: NodeStore, private readonly journal: Journal,
    private readonly mounts: MountManager, private readonly traces: TraceService, now?: () => number) {
    this.server = createServer(socket => this.accept(socket));
    [this.refreshes, this.streams] = this.background(mounts, journal, now)
  }

  private background(mounts: MountManager, journal: Journal, now?: () => number): [ServerRefresh, FixtureStreamDriver] {
    const run = (work: () => Promise<void>) => this.enqueueWork(work)
    const ctl = (path: AbsolutePath, handler: CtlHandler) => this.registerCtl(path, handler)
    return [new ServerRefresh(mounts, journal, run, now), new FixtureStreamDriver(mounts, journal, run, ctl)]
  }

  static async start(options: StartOptions): Promise<YafsServer> {
    const services = await openServices(options)
    const server = new YafsServer(services.store, services.journal, services.mounts, services.traces, options.now)
    await listen(server.server, options); server.refreshes.start(); server.streams.start(); return server
  }

  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Server is not listening')
    return { host: address.address, port: address.port }
  }

  async close(): Promise<void> {
    this.refreshes.close(); this.streams.close()
    this.closeSockets(); await this.closeNetwork(); await this.journal.close()
  }

  private closeSockets() { for (const socket of this.sockets) socket.destroy() }

  private closeNetwork() {
    return new Promise<void>((resolve, reject) =>
      this.server.close(error => { if (error) reject(error); else resolve() }))
  }

  private accept(socket: Socket) {
    this.observe(socket)
    this.attachSession(socket, new Yafs({ store: this.store, mounts: this.mounts, traces: this.traces }))
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
    const run = () => this.executeLine(session, line, socket)
    this.queue = this.queue.then(run).catch(error => this.abort(socket, error))
  }

  private abort(socket: Socket, error: unknown) {
    console.error('Unhandled error executing command:', error); socket.destroy()
  }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = requestOrReject(line, socket); if (!request) return
    try { await this.executeRequest(session, request, socket) }
    catch (error) { respond(socket, persistenceFailure(request.id, error)) }
  }

  private async executeRequest(session: Yafs, request: Request, socket: Socket) {
    const plan = await this.plan(session, request)
    await this.commit(session, this.ctl.intercept(plan.operations))
    respond(socket, { version: 1, id: request.id, result: plan.result })
  }

  registerCtl(path: AbsolutePath, handler: CtlHandler) { this.ctl.register(path, handler) }
  unregisterCtl(path: AbsolutePath) { this.ctl.unregister(path) }

  private plan(session: Yafs, request: Request) {
    return isWriteRequest(request) ? session.planWrite(request.write.path, request.write.content)
      : session.planAsync(request.command)
  }

  private async commit(session: Yafs, operations: VfsOperation[]) {
    await this.journal.commit(operations); session.apply(operations)
    try { await this.journal.compact(this.store) } catch (error) { console.error('Journal compaction failed:', error) }
  }

  async refreshDue() { return this.refreshes.due() }
  commitBackground(operations: VfsOperation[]): Promise<void> {
    return new BackgroundCommit(this.store, this.journal, work => this.enqueueWork(work)).commit(operations)
  }
  private enqueueWork(work: () => Promise<void>) { this.queue = this.queue.then(work); return this.queue }
}
