import { dirname } from 'node:path'
import { Server } from 'node:net'

import { NodeStore } from '../vfs/NodeStore'
import { VfsOperation } from '../vfs/VfsOperation'
import { MountManager } from '../mounts/MountManager'
import { defaultProviders } from '../mounts/defaultProviders'
import { Journal } from './Journal'
import { StartOptions } from './server'
import { openBlobStore } from './BlobStore'
import { TraceService } from '../traces/TraceService'
import { retainTraces } from '../traces/TraceRetention'
import { defaultTraceReifier } from '../mounts/GitHubTraceReifier'
import { CacheService } from '../cache/CacheService'
import { retainCaches } from '../cache/CacheRetention'

type Paths = ReturnType<typeof mountPaths>

export function replay(mounts: MountManager) {
  return (operation: VfsOperation) => replayOperation(mounts, operation)
}
function replayOperation(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === 'mount') mounts.restoreOperation(operation.record)
  if (operation.type === 'refresh') mounts.restoreRefresh(operation.record)
  if (operation.type === 'unmount') mounts.restoreUnmount(operation.id)
}
export async function openServices(options: StartOptions) {
  const store = new NodeStore(); const paths = mountPaths(options)
  const mounts = mountManager(store, paths, options); return services(store, mounts, paths, options)
}
async function services(store: NodeStore, mounts: MountManager, paths: Paths,
  options: StartOptions) {
  const blobs = openBlobStore(`${paths.directory}/blobs`); const traces = traceService(blobs, options)
  return finishServices(store, mounts, traces, new CacheService(blobs), options)
}
function traceService(blobs: ReturnType<typeof openBlobStore>, options: StartOptions) {
  return new TraceService(blobs, options.traceReifier || defaultTraceReifier())
}
async function finishServices(store: NodeStore, mounts: MountManager, traces: TraceService,
  cache: CacheService, options: StartOptions) {
  const journal = await Journal.open(journalPath(options), store, replay(mounts))
  retainTraces(store, traces); retainCaches(store, cache); return { store, mounts, journal, traces, cache }
}
function mountManager(store: NodeStore, paths: ReturnType<typeof mountPaths>, options: StartOptions) {
  return new MountManager(store, paths.state, paths.audit, undefined, options.providers || defaultProviders())
}
export function listen(server: Server, options: StartOptions): Promise<void> {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, options.host || '127.0.0.1', resolve) })
}
function journalPath(options: StartOptions) { if (options.walPath) return options.walPath; if (!options.dataDir) throw new Error('walPath or dataDir is required'); return `${options.dataDir}/journal.ndjson` }
function mountPaths(options: StartOptions) {
  const directory = options.dataDir || dirname(journalPath(options))
  return { directory, state: `${directory}/mounts.json`, audit: `${directory}/audit.ndjson` }
}
