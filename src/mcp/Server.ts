import { callTool, tools } from './Tools'
import { McpClient, McpId, McpRequest, McpResponse } from './types'

const protocolVersion = '2025-11-25'

export class McpServer {
  constructor(private readonly client: McpClient) {}

  async receive(value: unknown): Promise<McpResponse | undefined> {
    const request = requestFor(value)
    if (!hasId(request)) return undefined
    return this.respond(request)
  }

  private async respond(request: McpRequest): Promise<McpResponse> {
    const result = standardResult(request.method)
    if (result) return response(request.id!, result)
    return this.callOrError(request)
  }

  private async callOrError(request: McpRequest): Promise<McpResponse> {
    if (request.method === 'tools/call') return response(request.id!, await this.call(request))
    return error(request.id!, -32601, `Method not found: ${request.method}`)
  }

  private call(request: McpRequest) {
    const params = callParams(request.params)
    return callTool(this.client, params.name, params.arguments)
  }
}

function requestFor(value: unknown): McpRequest {
  const request = requestObject(value)
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC request')
  return request
}

function requestObject(value: unknown): McpRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid JSON-RPC request')
  return value as McpRequest
}

function hasId(request: McpRequest): boolean { return Object.hasOwn(request, 'id') }
function response(id: McpId, result: unknown): McpResponse { return { jsonrpc: '2.0', id, result } }
function error(id: McpId, code: number, message: string): McpResponse { return { jsonrpc: '2.0', id, error: { code, message } } }

function initialized() {
  return { protocolVersion, capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'yafs-mcp', version: '0.1.0' } }
}

function standardResult(method: string) {
  if (method === 'initialize') return initialized()
  if (method === 'tools/list') return { tools: tools() }
  return undefined
}

function callParams(value: unknown): { name: string, arguments: unknown } {
  const params = parameterObject(value)
  if (typeof params.name !== 'string') throw new Error('tools/call requires a tool name')
  return { name: params.name, arguments: params.arguments }
}

function parameterObject(value: unknown): { name?: unknown, arguments?: unknown } {
  if (!value || typeof value !== 'object') throw new Error('tools/call requires parameters')
  return value as { name?: unknown, arguments?: unknown }
}
