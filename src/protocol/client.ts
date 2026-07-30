import { createConnection, type Socket } from 'node:net'

import type { ExecutionResult } from '../types/ExecutionResult'

type Response = { id: number, result: ExecutionResult }

export class YashClient {
  private nextId = 1
  private buffer = ''
  private pending = new Map<number, { resolve: (result: ExecutionResult) => void, reject: (error: Error) => void }>()

  private constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8')
    socket.on('data', chunk => this.receive(chunk))
    socket.on('error', error => this.failPending(error))
    socket.on('close', () => this.failPending(new Error('Connection closed')))
  }

  static async connect(address: { host: string, port: number }): Promise<YashClient> {
    const socket = createConnection(address)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    return new YashClient(socket)
  }

  async exec(command: string): Promise<string> {
    const result = await this.execute(command)
    if (result.error) throw new Error(result.error.message)
    return result.stdout
  }

  execute(command: string): Promise<ExecutionResult> {
    const id = this.nextId++
    return new Promise((resolve, reject) => this.request(id, command, resolve, reject))
  }

  async close(): Promise<void> {
    this.socket.end()
    await new Promise<void>(resolve => this.socket.once('close', resolve))
  }

  async complete(input: string): Promise<string[]> {
    const completion = completionTarget(input)
    const result = await this.execute(`ls ${completion.directory}`)
    if (result.error) return []
    return result.stdout.split('\n').filter(name => name.startsWith(completion.prefix)).map(completion.format)
  }

  private receive(chunk: string) {
    this.buffer += chunk
    this.responses().forEach(response => this.resolve(response))
  }

  private request(id: number, command: string, resolve: (result: ExecutionResult) => void, reject: (error: Error) => void) {
    if (this.socket.destroyed) return reject(new Error('Connection closed'))
    this.pending.set(id, { resolve, reject })
    this.socket.write(JSON.stringify({ id, command }) + '\n')
  }

  private responses(): Response[] {
    const responses: Response[] = []
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) !== -1) this.pushResponse(responses, newline)
    return responses
  }

  private pushResponse(responses: Response[], newline: number) {
    const line = this.takeLine(newline)
    if (line) responses.push(JSON.parse(line) as Response)
  }

  private takeLine(newline: number): string {
    const line = this.buffer.slice(0, newline)
    this.buffer = this.buffer.slice(newline + 1)
    return line
  }

  private resolve(response: Response) {
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    pending.resolve(response.result)
  }

  private failPending(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

function completionTarget(input: string) {
  const token = input.trimEnd().split(/\s+/).at(-1) || ''
  const slash = token.lastIndexOf('/')
  const directory = slash === -1 ? '.' : (token.slice(0, slash) || '/')
  const prefix = slash === -1 ? token : token.slice(slash + 1)
  return { directory, prefix, format: (name: string) => slash === -1 ? name : `${token.slice(0, slash + 1)}${name}` }
}
