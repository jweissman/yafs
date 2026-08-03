import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'

import Yafs from '../index'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { attachLines, parseRequest, persistenceFailure, requestFailure, respond,
  Request } from './Framing'

type StartOptions = { walPath?: string, dataDir?: string, port?: number, host?: string }

export class YafsServer {
  private readonly server: Server
  private queue: Promise<void> = Promise.resolve()
  private sockets = new Set<Socket>()

  private constructor(private readonly store: NodeStore, private readonly journal: Journal,
    private readonly mounts: MountManager) {
    this.server = createServer(socket => this.accept(socket))
  }

  static async start(options: StartOptions): Promise<YafsServer> {
    const services = await openServices(options)
    const yafsServer = new YafsServer(services.store, services.journal, services.mounts)
    await listen(yafsServer.server, options); return yafsServer
  }

  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Server is not listening')
    return { host: address.address, port: address.port }
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await this.closeNetwork()
    await this.journal.close()
  }

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
    const plan = session.plan(request.command); await this.commit(session, plan.operations)
    respond(socket, { version: 1, id: request.id, result: plan.result })
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
}

function replay(mounts: MountManager) {
  return (operation: VfsOperation) => replayMountOperation(mounts, operation)
}

function replayMountOperation(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === 'mount') mounts.restoreOperation(operation.record)
  if (operation.type === 'refresh') mounts.restoreRefresh(operation.record)
  if (operation.type === 'unmount') mounts.restoreUnmount(operation.id)
}

async function openServices(options: StartOptions) {
  const store = new NodeStore(); const paths = mountPaths(options)
  const mounts = new MountManager(store, paths.state, paths.audit)
  return { store, mounts, journal: await Journal.open(journalPath(options), store, replay(mounts)) }
}

function listen(server: Server, options: { port?: number, host?: string }): Promise<void> {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, options.host || '127.0.0.1', resolve) })
}

function journalPath(options: { walPath?: string, dataDir?: string }): string {
  if (options.walPath) return options.walPath
  if (!options.dataDir) throw new Error('walPath or dataDir is required')
  return `${options.dataDir}/journal.ndjson`
}

function mountPaths(options: StartOptions) {
  const directory = options.dataDir || dirname(journalPath(options))
  return { state: `${directory}/mounts.json`, audit: `${directory}/audit.ndjson` }
}
