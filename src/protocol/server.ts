import { createServer, type Server, type Socket } from 'node:net'
import Yafs from '../index'
import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { ProviderRegistry } from '../mounts/ProviderRegistry'
import { openServices, listen } from './ServerServices'
import { attachLines, isCacheRequest, isWriteRequest, persistenceFailure, requestOrReject, respond, Request } from './Framing'
import { TraceReifier, TraceService } from '../traces/TraceService'
import { CtlDispatch, CtlHandler } from './CtlDispatch'
import { BackgroundCommit } from './BackgroundCommit'
import { BackgroundDrivers, ModelFor, backgroundDrivers, startAll, closeAll, syncAll, recoverAll } from './BackgroundDrivers'
import { chatCompletionClientFor } from '../agents/ChatCompletionClient'
import { DesiredMounts as Desired } from '../mounts/DesiredMounts'
import { daemonDesiredMounts } from '../mounts/daemonDesiredMounts'
import { reconcileDesired } from './ReconcileDesired'
import { CacheService } from '../cache/CacheService'

export type StartOptions = {
  walPath?: string, dataDir?: string, port?: number, host?: string, providers?: ProviderRegistry,
  now?: () => number, traceReifier?: TraceReifier, modelFor?: ModelFor, configPath?: string
}

export class YafsServer {
  private readonly server: Server
  private queue: Promise<void> = Promise.resolve()
  private sockets = new Set<Socket>()
  private readonly background: BackgroundDrivers; private readonly ctl = new CtlDispatch()
  private constructor(private readonly store: NodeStore, private readonly journal: Journal,
    private readonly mounts: MountManager, private readonly traces: TraceService, private readonly cache: CacheService,
    private readonly desired: Desired, now: (() => number) | undefined, modelFor: ModelFor) {
    this.server = createServer(socket => this.accept(socket)); this.background = this.drivers(now, modelFor)
  }
  private drivers(now: (() => number) | undefined, modelFor: ModelFor) {
    const run = this.enqueueWork.bind(this); const ctl = this.registerCtl.bind(this)
    return backgroundDrivers(this.mounts, this.journal, run, ctl, this.unregisterCtl.bind(this), modelFor, now)
  }
  static async start(options: StartOptions): Promise<YafsServer> {
    const s = YafsServer.construct(await openServices(options), options); const bg = s.background
    await recoverAll(bg); await reconcileDesired(s.desired, () => s.session(), s.commit.bind(s))
    await listen(s.server, options); startAll(bg); return s
  }
  private static construct(services: Awaited<ReturnType<typeof openServices>>, options: StartOptions) {
    const {store, journal, mounts, traces, cache} = services; const model = options.modelFor || chatCompletionClientFor
    return new YafsServer(store, journal, mounts, traces, cache, daemonDesiredMounts(mounts, options), options.now,
      model)
  }
  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Not listening'); return { host: address.address, port: address.port }
  }
  async close(): Promise<void> {
    closeAll(this.background); this.sockets.forEach(socket => socket.destroy())
    await new Promise<void>((ok, no) => this.server.close(error => error ? no(error) : ok()))
    await this.journal.close()
  }

  private accept(socket: Socket) { this.observe(socket); this.attachSession(socket, this.session()) }

  private session() {
    return new Yafs({ store: this.store, mounts: this.mounts, traces: this.traces, cache: this.cache,
      desired: this.desired })
  }

  private observe(socket: Socket) {
    this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket)); socket.on('error', () => socket.destroy())
  }

  private attachSession(socket: Socket, session: Yafs) {
    socket.setEncoding('utf8'); attachLines(socket, line => this.enqueue(session, line, socket))
  }

  private enqueue(session: Yafs, line: string, socket: Socket) {
    const run = () => this.executeLine(session, line, socket)
    this.queue = this.queue.then(run).catch(error => this.abort(socket, error))
  }

  private abort(socket: Socket, error: unknown) { console.error('Unhandled command error:', error); socket.destroy() }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = requestOrReject(line, socket); if (!request) return
    try { await this.executeRequest(session, request, socket) }
    catch (error) { respond(socket, persistenceFailure(request.id, error)) }
  }

  private async executeRequest(session: Yafs, request: Request, socket: Socket) {
    const plan = await this.plan(session, request)
    await this.commit(session, await this.ctl.intercept(plan.operations))
    respond(socket, { version: 1, id: request.id, result: plan.result })
  }
  registerCtl(path: AbsolutePath, handler: CtlHandler) { this.ctl.register(path, handler) }
  unregisterCtl(path: AbsolutePath) { this.ctl.unregister(path) }

  private plan(session: Yafs, request: Request) {
    if (isCacheRequest(request)) return session.planCache(request.cache)
    return isWriteRequest(request) ? session.planWrite(request.write.path, request.write.content)
      : session.planAsync(request.command)
  }

  private async commit(session: Yafs, operations: VfsOperation[]) {
    await this.journal.commit(operations); session.apply(operations); syncAll(this.background)
    try { await this.journal.compact(this.store) } catch (error) { console.error('Journal compaction failed:', error) }
  }

  async refreshDue() { return this.background.refreshes.due() }
  commitBackground(operations: VfsOperation[]): Promise<void> {
    return new BackgroundCommit(this.store, this.journal, work => this.enqueueWork(work)).commit(operations)
  }
  private enqueueWork(work: () => Promise<void>) { this.queue = this.queue.then(work); return this.queue }
}
