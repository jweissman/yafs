import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'

import Yafs from '../index'
import { type ExecutionResult } from '../types/ExecutionResult'
import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { Journal } from './Journal'
import { MountManager } from '../mounts/MountManager'
import { PROTOCOL_VERSION } from './version'

type Request = { version: number, id: number, command: string }
type Response = { version: number, id: number, result: ExecutionResult }
type ProtocolFailure = { version: number, id: number, error: { code: string, message: string } }
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
    catch (error) { this.respondFailure(socket, request.id, error) }
  }

  private async executeRequest(session: Yafs, request: Request, socket: Socket) {
    const plan = session.plan(request.command); await this.commit(session, plan.operations)
    this.respond(socket, { version: PROTOCOL_VERSION, id: request.id, result: plan.result })
  }

  private requestOrClose(line: string, socket: Socket): Request | undefined {
    try { return parseRequest(line) } catch (error) { return this.rejectRequest(error, socket) }
  }

  private rejectRequest(error: unknown, socket: Socket): undefined {
    if (this.isRequestError(error)) { this.rejectVersion(error, socket); return undefined }
    socket.destroy(); return undefined
  }

  private isRequestError(error: unknown): error is RequestError {
    return error instanceof RequestError && Number.isInteger(error.id)
  }

  private rejectVersion(error: RequestError, socket: Socket) {
    this.respond(socket, failure(error.id, error.code, error.message))
  }

  private respond(socket: Socket, response: Response | ProtocolFailure) {
    if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n')
  }

  private respondFailure(socket: Socket, id: number, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    this.respond(socket, { version: PROTOCOL_VERSION, id, error: { code: 'persistence_error', message } })
  }

  private async commit(session: Yafs, operations: VfsOperation[]) {
    this.store.validate(operations)
    await this.journal.commit(operations); session.apply(operations)
    try { await this.journal.compact(this.store) } catch (error) { console.error('Journal compaction failed:', error) }
  }
}

function replay(mounts: MountManager) {
  return (operation: VfsOperation) => replayMountOperation(mounts, operation)
}

function replayMountOperation(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === 'mount') mounts.restoreOperation(operation.record)
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

function attachLines(socket: Socket, onLine: (line: string) => void) {
  let buffer = ''; socket.on('data', chunk => { buffer += chunk; if (buffer.length > 1_048_576) return socket.destroy(); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.filter(Boolean).forEach(onLine) })
}

function parseRequest(line: string): Request {
  const request = JSON.parse(line) as Request; verifyRequest(request); return request
}

function verifyRequest(request: Request) {
  verifyRequestShape(request)
  if (request.version !== PROTOCOL_VERSION) throw unsupportedVersion(request)
}

function verifyRequestShape(request: Request) {
  if (!Number.isInteger(request.id) || typeof request.command !== 'string') throw new Error('Expected request')
}

function unsupportedVersion(request: Request) {
  return new RequestError(request.id, 'unsupported_version', `Unsupported protocol version: ${request.version}`)
}

class RequestError extends Error {
  constructor(readonly id: number, readonly code: string, message: string) { super(message) }
}

function failure(id: number, code: string, message: string): ProtocolFailure {
  return { version: PROTOCOL_VERSION, id, error: { code, message } }
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
