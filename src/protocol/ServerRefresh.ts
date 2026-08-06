import { Journal } from './Journal'
import { MountRefreshScheduler } from '../mounts/MountRefreshScheduler'
import { MountManager } from '../mounts/MountManager'
import { PreparedMountRecord } from '../mounts/types'

export class ServerRefresh {
  private readonly scheduler: MountRefreshScheduler
  private timer?: Timer

  constructor(private readonly mounts: MountManager, private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>, now?: () => number,
    private readonly intervalMs = 60_000) {
    this.scheduler = new MountRefreshScheduler(() => mounts.mounts(), record => this.schedule(record), now)
  }

  start() { this.timer = setInterval(() => void this.due().catch(console.error), this.intervalMs) }
  close() { if (this.timer) clearInterval(this.timer) }
  due() { return this.scheduler.tick() }

  private schedule(record: PreparedMountRecord) { return this.enqueue(() => this.refresh(record)) }
  private async refresh(record: PreparedMountRecord) {
    try { await this.refreshOnce(record) }
    catch (error) { console.error(`Scheduled refresh failed for mount ${record.id}:`, error) }
  }
  private async refreshOnce(record: PreparedMountRecord) {
    const prepared = await this.mounts.prepareRefreshRecord(record, 'system')
    await this.journal.commit([{ type: 'refresh', record: prepared, at: new Date().toISOString() }])
    this.mounts.refresh(prepared, 'system')
  }
}
