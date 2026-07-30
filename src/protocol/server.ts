import { appendFile, readFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'

import Yafs from '../index'
import { type ExecutionResult } from '../types/ExecutionResult'
import { NodeStore } from '../vfs/NodeStore'

type Request = { id: number, command: string }
type Response = { id: number, result: ExecutionResult }

export class YafsServer {
  private readonly server: Server
  private queue: Promise<void> = Promise.resolve()
  private sockets = new Set<Socket>()

  private constructor(private readonly store: NodeStore, private readonly walPath: string) {
    this.server = createServer(socket => this.accept(socket))
  }

  static async start(options: { walPath: string, port?: number, host?: string }): Promise<YafsServer> {
    const store = new NodeStore()
    await replayWal(store, options.walPath)
    const yafsServer = new YafsServer(store, options.walPath)
    await listen(yafsServer.server, options)
    return yafsServer
  }

  address(): { host: string, port: number } {
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Server is not listening')
    return { host: address.address, port: address.port }
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()))
  }

  private accept(socket: Socket) {
    this.sockets.add(socket)
    socket.once('close', () => this.sockets.delete(socket))
    const session = new Yafs({ store: this.store })
    socket.setEncoding('utf8')
    attachLines(socket, line => this.enqueue(session, line, socket))
  }

  private enqueue(session: Yafs, line: string, socket: Socket) {
    this.queue = this.queue.then(() => this.executeLine(session, line, socket)).catch(() => undefined)
  }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = parseRequest(line)
    const result = session.execute(request.command)
    await persist(this.walPath, session.drainMutations())
    this.respond(socket, { id: request.id, result })
  }

  private respond(socket: Socket, response: Response) {
    if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n')
  }
}

function listen(server: Server, options: { port?: number, host?: string }): Promise<void> {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, options.host || '127.0.0.1', resolve) })
}

function attachLines(socket: Socket, onLine: (line: string) => void) {
  let buffer = ''
  socket.on('data', chunk => { buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.filter(Boolean).forEach(onLine) })
}

function parseRequest(line: string): Request {
  const request = JSON.parse(line) as Request
  if (!Number.isInteger(request.id) || typeof request.command !== 'string') throw new Error('Expected { id: integer, command: string }')
  return request
}

async function persist(path: string, mutations: unknown[]) {
  if (mutations.length) await appendFile(path, mutations.map(mutation => JSON.stringify(mutation)).join('\n') + '\n')
}

async function replayWal(store: NodeStore, walPath: string) {
  const contents = await readWal(walPath)
  if (contents) contents.split('\n').filter(Boolean).forEach(line => store.apply(JSON.parse(line)))
}

async function readWal(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
