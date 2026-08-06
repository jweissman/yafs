import { AbsolutePath } from '../core/AbsolutePath'
import { CtlHandler } from '../protocol/CtlDispatch'
import { Journal } from '../protocol/Journal'
import { MountManager } from './MountManager'
import { PreparedMountRecord, SlackConfig } from './types'

export type SlackPoster = { postMessage(channel: string, text: string): Promise<string> }
type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void
type UnregisterCtl = (path: AbsolutePath) => void
type ClientFor = (config: SlackConfig) => SlackPoster
type Enqueue = (work: () => Promise<void>) => Promise<void>

export class SlackDirectoryDriver {
  private registered = new Set<AbsolutePath>()

  constructor(private readonly mounts: MountManager, private readonly journal: Journal,
    private readonly enqueue: Enqueue, private readonly registerCtl: RegisterCtl,
    private readonly unregisterCtl: UnregisterCtl, private readonly clientFor: ClientFor) {}

  close() { this.registered.forEach(path => this.unregisterCtl(path)); this.registered.clear() }

  sync() {
    const paths = new Set<AbsolutePath>(); this.mounts.mounts().forEach(record => this.registerRecord(record, paths))
    this.registered.forEach(path => { if (!paths.has(path)) this.unregisterCtl(path) }); this.registered = paths
  }

  private registerRecord(record: PreparedMountRecord, paths: Set<AbsolutePath>) {
    if (record.provider !== 'slack') return
    const path = `${record.path}/ctl` as AbsolutePath
    this.registerCtl(path, payload => this.send(record.id, payload)); paths.add(path)
  }

  private async send(mountId: string, payload: string) {
    const message = this.message(payload); void this.attempt(mountId, message)
  }

  private async attempt(mountId: string, message: string) {
    try { await this.post(mountId, message); await this.commitRefresh(mountId) }
    catch (error) { await this.commitError(mountId, message, error) }
  }

  private message(payload: string): string {
    const message = (JSON.parse(payload) as { message?: unknown }).message
    if (typeof message !== 'string') throw new Error(`Invalid slack action: ${payload}`)
    return message
  }

  private async post(mountId: string, message: string) {
    const config = this.record(mountId).config as SlackConfig
    await this.clientFor(config).postMessage(config.channel, message)
  }

  private record(mountId: string): PreparedMountRecord {
    const record = this.mounts.mounts().find(item => item.id === mountId)
    if (!record) throw new Error(`No such mount: ${mountId}`); return record
  }

  private commitRefresh(mountId: string) { return this.enqueue(() => this.applyRefresh(mountId)) }

  private async applyRefresh(mountId: string) {
    const record = this.mounts.mounts().find(item => item.id === mountId); if (!record) return
    await this.commit(await this.mounts.prepareRefreshRecord(record, 'system'))
  }

  private commitError(mountId: string, message: string, error: unknown) {
    return this.enqueue(() => this.applyError(mountId, message, error))
  }

  private async applyError(mountId: string, message: string, error: unknown) {
    const record = this.mounts.mounts().find(item => item.id === mountId); if (!record) return
    await this.commit(this.withError(record, message, error))
  }

  private withError(record: PreparedMountRecord, message: string, error: unknown): PreparedMountRecord {
    const entries = this.errorEntries(record.snapshot.entries, message, error)
    return { ...record, fetchedAt: new Date().toISOString(), snapshot: { ...record.snapshot, entries } }
  }

  private errorEntries(entries: [string, string][], message: string, error: unknown): [string, string][] {
    const detail = error instanceof Error ? error.message : String(error)
    const content = JSON.stringify({ message, error: detail, at: new Date().toISOString() })
    const byPath = new Map(entries); byPath.set('last-error.json', content); return [...byPath]
  }

  private async commit(updated: PreparedMountRecord) {
    await this.journal.commit([{ type: 'refresh', record: updated, at: new Date().toISOString() }])
    this.mounts.refresh(updated, 'system')
  }
}
