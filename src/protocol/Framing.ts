import { type Socket } from 'node:net'

import { type ExecutionResult } from '../types/ExecutionResult'
import { PROTOCOL_VERSION } from './version'

export type CommandRequest = { version: number, id: number, command: string }
export type WriteRequest = { version: number, id: number, write: { path: string, content: string } }
export type Request = CommandRequest | WriteRequest
export type Response = { version: number, id: number, result: ExecutionResult }
export type ProtocolFailure = {
  version: number, id: number, error: { code: string, message: string }
}

export function parseRequest(line: string): Request {
  const request = JSON.parse(line) as Request; verifyRequest(request); return request
}

export function isWriteRequest(request: Request): request is WriteRequest {
  return 'write' in request
}

export function requestFailure(error: unknown): ProtocolFailure | undefined {
  return error instanceof RequestError && Number.isInteger(error.id)
    ? failure(error.id, error.code, error.message) : undefined
}

export function respond(socket: Socket, response: Response | ProtocolFailure) {
  if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n')
}

export function persistenceFailure(id: number, error: unknown): ProtocolFailure {
  const message = error instanceof Error ? error.message : String(error)
  return failure(id, 'persistence_error', message)
}

export function attachLines(socket: Socket, onLine: (line: string) => void) {
  let buffer = ''
  socket.on('data', chunk => { buffer += chunk; consumeLines(socket, onLine, () => buffer, value => buffer = value) })
}

function consumeLines(socket: Socket, onLine: (line: string) => void, current: () => string,
  update: (value: string) => void) {
  if (current().length > 1_048_576) return socket.destroy()
  const lines = current().split('\n'); update(lines.pop() || ''); lines.filter(Boolean).forEach(onLine)
}

function verifyRequest(request: Request) {
  if (!Number.isInteger(request.id) || !validPayload(request)) throw new Error('Expected request')
  if (request.version !== PROTOCOL_VERSION) throw new RequestError(request.id, 'unsupported_version', `Unsupported protocol version: ${request.version}`)
}

function validPayload(request: Request) {
  const write = (request as Partial<WriteRequest>).write
  return typeof (request as Partial<CommandRequest>).command === 'string' || Boolean(write && validWrite(write))
}

function validWrite(write: WriteRequest['write']) {
  return typeof write.path === 'string' && typeof write.content === 'string'
}

function failure(id: number, code: string, message: string): ProtocolFailure {
  return { version: PROTOCOL_VERSION, id, error: { code, message } }
}

class RequestError extends Error {
  constructor(readonly id: number, readonly code: string, message: string) { super(message) }
}
