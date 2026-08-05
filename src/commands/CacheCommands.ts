import { CacheEntry } from '../cache/CacheService'
import { CacheRequest } from '../cache/CacheRequest'
import { cacheMetadataPath, cacheMetadataRoot, cacheRoot } from '../cache/CachePaths'
import { BuiltinCommand } from './BuiltinCommand'
import { CommandContext } from './CommandContext'

export function cacheCommands(): BuiltinCommand[] { return [cacheCommand()] }

function cacheCommand(): BuiltinCommand {
  return { name: 'cache', synopsis: 'cache put --ttl DURATION KEY VALUE | get KEY | stat KEY | delete KEY | gc',
    access: 'mutate', execute: (context, args) => cache(context, args) }
}
function cache(context: CommandContext, args: string[]) {
  const request = shellRequest(context, args)
  if (request) return cacheRequest(context, request)
  throw new Error('cache expects put, get, stat, delete, or gc')
}
function shellRequest(context: CommandContext, args: string[]): CacheRequest | undefined {
  if (args[0] === 'put') return putRequest(context, args)
  if (['get', 'stat', 'delete'].includes(args[0])) return { operation: args[0] as 'get' | 'stat' | 'delete', key: context.required('cache', args, 1) }
  if (args[0] === 'gc') return { operation: 'gc' }
}
export async function cacheRequest(context: CommandContext, request: CacheRequest): Promise<string> {
  if (request.operation === 'put') return put(context, request)
  if (request.operation === 'get') return get(context, request.key)
  return inspectOrMutate(context, request)
}
function inspectOrMutate(context: CommandContext, request: Exclude<CacheRequest, { operation: 'put' | 'get' }>) {
  if (request.operation === 'stat') return stat(context, request.key)
  if (request.operation === 'delete') return remove(context, request.key)
  return gc(context)
}
function putRequest(context: CommandContext, args: string[]): CacheRequest {
  if (args[1] !== '--ttl') throw new Error('cache put requires --ttl DURATION')
  return { operation: 'put', ttlMs: duration(context.required('cache put', args, 2)),
    key: context.required('cache put', args, 3), value: context.required('cache put', args, 4) }
}
async function put(context: CommandContext, request: Extract<CacheRequest, { operation: 'put' }>) {
  const previous = entry(context, request.key)
  const next = await context.cache.create(request.key, request.value, request.ttlMs, context.clock.now())
  parents(context); context.write(cacheMetadataPath(request.key), JSON.stringify(next)); retain(context, previous, next); return ''
}
async function get(context: CommandContext, key: string) {
  return context.cache.read(requiredEntry(context, key))
}
function stat(context: CommandContext, key: string) {
  const item = storedEntry(context, key)
  return JSON.stringify({ ...item, state: context.cache.expired(item, context.clock.now()) ? 'expired' : 'active' })
}
function remove(context: CommandContext, key: string) {
  const item = requiredEntry(context, key)
  context.remove(cacheMetadataPath(key)); context.afterCommit(() => context.cache.release(item)); return ''
}
async function gc(context: CommandContext) {
  expired(context).forEach(item => context.cache.release(item)); return JSON.stringify(await context.cache.gc())
}
function expired(context: CommandContext) {
  const paths = context.exists(cacheMetadataRoot) ? context.list(cacheMetadataRoot) : []
  const entries = paths.map(name => context.cache.parse(context.read(child(name))))
  return entries.filter(item => context.cache.expired(item, context.clock.now()))
}
function child(name: string) { return `${cacheMetadataRoot}/${name}` as import('../core/AbsolutePath').AbsolutePath }
function entry(context: CommandContext, key: string) {
  return context.exists(cacheMetadataPath(key)) ? context.cache.parse(context.read(cacheMetadataPath(key))) : undefined
}
function requiredEntry(context: CommandContext, key: string) {
  const item = storedEntry(context, key)
  if (!item || context.cache.expired(item, context.clock.now())) throw new Error(`Cache miss: ${key}`)
  return item
}
function storedEntry(context: CommandContext, key: string) {
  const item = entry(context, key); if (!item) throw new Error(`Cache miss: ${key}`)
  return item
}
function parents(context: CommandContext) {
  if (!context.exists(cacheRoot)) context.mkdir(cacheRoot)
  if (!context.exists(cacheMetadataRoot)) context.mkdir(cacheMetadataRoot)
}
function retain(context: CommandContext, previous: CacheEntry | undefined, next: CacheEntry) {
  context.afterCommit(() => { if (previous) context.cache.release(previous); context.cache.retain(next) })
}
function duration(value: string) {
  const matched = value.match(/^(\d+)(ms|s|m|h)$/); if (!matched) throw new Error('Invalid cache TTL')
  return Number(matched[1]) * ({ ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[matched[2]] || 0)
}
