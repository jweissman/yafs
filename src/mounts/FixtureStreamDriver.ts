import { AbsolutePath } from '../core/AbsolutePath'
import { CtlHandler } from '../protocol/CtlDispatch'
import { Journal } from '../protocol/Journal'
import { MountManager } from './MountManager'
import { FixtureConfig, PreparedMountRecord, StreamSpec } from './types'

const POLL_MS = 50

export class FixtureStreamDriver {
  private timer?: Timer
  private registered = new Set<AbsolutePath>()

  constructor(private readonly mounts: MountManager, private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>,
    private readonly registerCtl: (path: AbsolutePath, handler: CtlHandler) => void,
    private readonly unregisterCtl: (path: AbsolutePath) => void,
    private readonly now = () => Date.now()) {}

  start() { this.sync(); this.timer = setInterval(() => this.tick(), POLL_MS) }
  close() { if (this.timer) clearInterval(this.timer); this.clearControls() }

  sync() {
    const paths = this.currentControls(); this.unregisterMissing(paths); this.registered = paths
  }

  private currentControls() {
    const paths = new Set<AbsolutePath>(); this.mounts.mounts().forEach(record => this.registerRecord(record, paths))
    return paths
  }

  private unregisterMissing(paths: Set<AbsolutePath>) {
    this.registered.forEach(path => { if (!paths.has(path)) this.unregisterCtl(path) })
  }

  private clearControls() { this.registered.forEach(path => this.unregisterCtl(path)); this.registered.clear() }

  private tick() { this.sync(); this.mounts.mounts().forEach(record => this.tickRecord(record)) }

  private registerRecord(record: PreparedMountRecord, paths: Set<AbsolutePath>) {
    if (record.provider !== 'fixture') return
    const streams = (record.config as FixtureConfig).streams || {}
    if (Object.keys(streams).length) paths.add(this.registerStreamCtl(record))
  }

  private tickRecord(record: PreparedMountRecord) {
    if (record.provider !== 'fixture') return
    const streams = (record.config as FixtureConfig).streams || {}
    Object.entries(streams).forEach(([path, spec]) => this.tickStream(record, path, spec))
  }

  private registerStreamCtl(record: PreparedMountRecord): AbsolutePath {
    const path = this.ctlPath(record); this.registerCtl(path, payload => this.restart(record.id, payload)); return path
  }

  private ctlPath(record: PreparedMountRecord): AbsolutePath { return `${record.path}/ctl` as AbsolutePath }

  private tickStream(record: PreparedMountRecord, path: string, spec: StreamSpec) {
    const content = this.content(record, path); const index = this.deliveredCount(content, spec.chunks)
    if (index >= spec.chunks.length || !this.due(record, spec.intervalMs)) return
    void this.enqueue(() => this.commit(record, path, content + spec.chunks[index], index + 1))
  }

  private content(record: PreparedMountRecord, path: string): string {
    return record.snapshot.entries.find(([entryPath]) => entryPath === path)?.[1] || ''
  }

  private deliveredCount(content: string, chunks: string[]): number {
    let cumulative = ''; let count = 0
    for (const chunk of chunks) { if (!content.startsWith(cumulative + chunk)) break; cumulative += chunk; count++ }
    return count
  }

  private due(record: PreparedMountRecord, intervalMs: number): boolean {
    const baseline = record.fetchedAt || record.activatedAt
    return !baseline || this.now() - Date.parse(baseline) >= intervalMs
  }

  private async restart(mountId: string, payload: string) {
    const record = this.mounts.mounts().find(item => item.id === mountId); if (!record) return
    const path = this.restartTarget(payload, (record.config as FixtureConfig).streams || {})
    await this.commit(record, path, '', 0)
  }

  private restartTarget(payload: string, streams: Record<string, StreamSpec>): string {
    const path = (JSON.parse(payload) as { restart?: unknown }).restart
    if (typeof path !== 'string' || !(path in streams)) throw new Error(`Invalid restart action: ${payload}`)
    return path
  }

  private async commit(record: PreparedMountRecord, path: string, content: string, count: number) {
    const fresh = this.mounts.mounts().find(item => item.id === record.id); if (!fresh) return
    const updated = this.appended(fresh, path, content, count)
    await this.journal.commit([{ type: 'refresh', record: updated, at: new Date().toISOString() }]); this.mounts.refresh(updated, 'system')
  }

  private appended(record: PreparedMountRecord, path: string, content: string, count: number): PreparedMountRecord {
    const entries = this.withContent(record.snapshot.entries, path, content)
    const fields = { fetchedAt: new Date().toISOString(), revision: this.revision(record, count) }
    return { ...record, ...fields, snapshot: { ...record.snapshot, entries } }
  }

  private revision(record: PreparedMountRecord, count: number) {
    return `${record.manifestDigest.slice(0, 12)}:${count}`
  }

  private withContent(entries: [string, string][], path: string, content: string): [string, string][] {
    if (!entries.some(([entryPath]) => entryPath === path)) return [...entries, [path, content]]
    return entries.map(([entryPath, value]) => [entryPath, entryPath === path ? content : value])
  }
}
