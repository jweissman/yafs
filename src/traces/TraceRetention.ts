import { AbsolutePath } from '../core/AbsolutePath'
import { NodeStore } from '../vfs/NodeStore'
import { TraceService } from './TraceService'

export function retainTraces(store: NodeStore, traces: TraceService) {
  tracePaths(store, '/').forEach(path => retain(store, traces, path))
}

function retain(store: NodeStore, traces: TraceService, path: AbsolutePath) {
  const content = store.read(path); if (!isTrace(content)) return
  traces.retain(traces.parse(content), `trace:${parent(path)}`)
}
function tracePaths(store: NodeStore, path: AbsolutePath): AbsolutePath[] {
  return store.list(path).flatMap(name => paths(store, path, name))
}
function paths(store: NodeStore, parent: AbsolutePath, name: string): AbsolutePath[] {
  const path = `${parent === '/' ? '' : parent}/${name}` as AbsolutePath
  return store.type(path) === 'directory' ? tracePaths(store, path) : name === 'trace.json' ? [path] : []
}
function isTrace(content: string) {
  try { return (JSON.parse(content) as { kind?: string }).kind === 'yafs-trace' } catch { return false }
}
function parent(path: AbsolutePath) { return path.slice(0, path.lastIndexOf('/')) as AbsolutePath }
