import { createServer, type Server } from 'node:net'
import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { ProviderRegistry } from '../mounts/ProviderRegistry'
import { openServices, listen } from './ServerServices'
import { TraceReifier, TraceService } from '../traces/TraceService'
import { CtlHandler } from './CtlDispatch'
import { BackgroundCommit } from './BackgroundCommit'
import { BackgroundDrivers, ModelFor, SlackClientFor, backgroundDrivers, startAll, closeAll, recoverAll } from './BackgroundDrivers'
import { chatCompletionClientFor } from '../agents/ChatCompletionClient'
import { defaultSlackClient } from '../mounts/SlackApiClient'
import { DesiredMounts as Desired } from '../mounts/DesiredMounts'
import { daemonDesiredMounts } from '../mounts/daemonDesiredMounts'
import { reconcileDesired } from './ReconcileDesired'
import { CacheService } from '../cache/CacheService'
import { ServerConnection } from './ServerConnection'

export type StartOptions = {
  walPath?: string, dataDir?: string, port?: number, host?: string, providers?: ProviderRegistry,
  now?: () => number, traceReifier?: TraceReifier, modelFor?: ModelFor, slackClientFor?: SlackClientFor,
  configPath?: string, refreshIntervalMs?: number
}

type Services = { store: NodeStore, journal: Journal, mounts: MountManager, traces: TraceService,
  cache: CacheService, desired: Desired }

export class YafsServer {
  private readonly server: Server
  private readonly connection: ServerConnection
  private background!: BackgroundDrivers
  private constructor(private readonly services: Services) {
    this.connection = new ServerConnection(services, () => this.background)
    this.server = createServer(socket => this.connection.attach(socket))
  }
  private drivers(now: (() => number) | undefined, modelFor: ModelFor, slackClientFor: SlackClientFor,
    refreshIntervalMs?: number) {
    return backgroundDrivers(this.wiring(), modelFor, slackClientFor, now, refreshIntervalMs)
  }
  private driversFor(options: StartOptions) {
    const [modelFor, slackClientFor] = defaultClients(options)
    return this.drivers(options.now, modelFor, slackClientFor, options.refreshIntervalMs)
  }
  private wiring() {
    const enqueue = this.connection.enqueueWork.bind(this.connection)
    return { mounts: this.services.mounts, journal: this.services.journal, enqueue,
      registerCtl: this.registerCtl.bind(this), unregisterCtl: this.unregisterCtl.bind(this) }
  }
  static async start(options: StartOptions): Promise<YafsServer> {
    const s = YafsServer.construct(await openServices(options), options); const bg = s.background
    await recoverAll(bg); await s.reconcile(); await listen(s.server, options); startAll(bg); return s
  }
  private reconcile() {
    const commit = this.connection.commit.bind(this.connection)
    return reconcileDesired(this.services.desired, () => this.connection.session(), commit)
  }
  private static construct(services: Awaited<ReturnType<typeof openServices>>, options: StartOptions) {
    const desired = daemonDesiredMounts(services.mounts, options)
    const server = new YafsServer({ ...services, desired })
    server.background = server.driversFor(options); return server
  }
  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Not listening')
    return { host: address.address, port: address.port }
  }
  async close(): Promise<void> {
    closeAll(this.background); this.connection.closeSockets()
    await new Promise<void>((ok, no) => this.server.close(error => error ? no(error) : ok()))
    await this.services.journal.close()
  }

  registerCtl(path: AbsolutePath, handler: CtlHandler) { this.connection.ctl.register(path, handler) }
  unregisterCtl(path: AbsolutePath) { this.connection.ctl.unregister(path) }

  async refreshDue() { return this.background.refreshes.due() }
  commitBackground(operations: VfsOperation[]): Promise<void> {
    const { store, journal } = this.services
    return new BackgroundCommit(store, journal, work => this.connection.enqueueWork(work)).commit(operations)
  }
}

function defaultClients(options: StartOptions): [ModelFor, SlackClientFor] {
  return [options.modelFor || chatCompletionClientFor, options.slackClientFor || (() => defaultSlackClient())]
}
