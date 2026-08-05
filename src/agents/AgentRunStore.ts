import { Journal } from '../protocol/Journal'
import { MountManager } from '../mounts/MountManager'
import { PreparedMountRecord } from '../mounts/types'

export type Status = {
  state: 'queued' | 'running' | 'complete' | 'failed' | 'interrupted' | 'cancelled', startedAt: string, completedAt?: string, error?: string
}

export class AgentRunStore {
  constructor(private readonly mounts: MountManager, private readonly journal: Journal,
    private readonly enqueue: (work: () => Promise<void>) => Promise<void>) {}

  writeStatus(mountId: string, personaName: string, runId: string, status: Status) {
    const detail = this.detail(personaName, runId, status)
    return this.commitEntries(mountId, [this.statusEntry(personaName, runId, status)], detail)
  }

  accept(mountId: string, personaName: string, runId: string, message: string, status: Status, context?: string) {
    const updates = this.acceptedEntries(personaName, runId, message, status, context)
    return this.applyEntries(mountId, updates, this.detail(personaName, runId, status))
  }

  private acceptedEntries(persona: string, runId: string, message: string, status: Status, context?: string) {
    const entries = [this.statusEntry(persona, runId, status), this.requestEntry(persona, runId, message)]
    return context === undefined ? entries : [...entries, this.contextEntry(persona, runId, context)]
  }

  interrupt(mountId: string, personaName: string, runId: string, status: Status) {
    const updates = [this.statusEntry(personaName, runId, status)]
    return this.applyEntries(mountId, updates, this.detail(personaName, runId, status))
  }

  cancel(mountId: string, personaName: string, runId: string, status: Status) {
    return this.interrupt(mountId, personaName, runId, status)
  }

  finish(mountId: string, personaName: string, runId: string, startedAt: string, message: string,
    reply: string) {
    const { updates, detail } = this.completion(personaName, runId, startedAt, message, reply)
    return this.commitEntries(mountId, updates, detail)
  }

  private completion(personaName: string, runId: string, startedAt: string, message: string, reply: string) {
    const status: Status = { state: 'complete', startedAt, completedAt: new Date().toISOString() }
    const updates = this.runFiles(personaName, runId, status, message, reply)
    return { updates, detail: this.detail(personaName, runId, status) }
  }

  private detail(personaName: string, runId: string, status: Status): string {
    return `persona=${personaName} run=${runId} state=${status.state}`
  }

  private runFiles(personaName: string, runId: string, status: Status, message: string,
    reply: string): [string, string][] {
    return [this.statusEntry(personaName, runId, status), this.requestEntry(personaName, runId, message),
      this.responseEntry(personaName, runId, reply)]
  }

  private requestEntry(personaName: string, runId: string, message: string): [string, string] {
    return [`${personaName}/runs/${runId}/request.md`, message]
  }

  private responseEntry(personaName: string, runId: string, reply: string): [string, string] {
    return [`${personaName}/runs/${runId}/response.md`, reply]
  }

  private contextEntry(personaName: string, runId: string, context: string): [string, string] {
    return [`${personaName}/runs/${runId}/context.md`, context]
  }

  private statusEntry(personaName: string, runId: string, status: Status): [string, string] {
    return [`${personaName}/runs/${runId}/status.json`, JSON.stringify(status)]
  }

  private commitEntries(mountId: string, updates: [string, string][], detail: string) {
    return this.enqueue(() => this.applyEntries(mountId, updates, detail))
  }

  private async applyEntries(mountId: string, updates: [string, string][], detail: string) {
    const record = this.mounts.mounts().find(item => item.id === mountId); if (!record) return
    const entries = this.merged(record.snapshot.entries, updates)
    await this.commit(this.withEntries(record, entries), detail)
  }

  private withEntries(record: PreparedMountRecord, entries: [string, string][]): PreparedMountRecord {
    return { ...record, fetchedAt: new Date().toISOString(), snapshot: { ...record.snapshot, entries } }
  }

  private async commit(updated: PreparedMountRecord, detail: string) {
    await this.journal.commit([{ type: 'refresh', record: updated, at: new Date().toISOString() }])
    this.mounts.refresh(updated, 'system', detail)
  }

  private merged(entries: [string, string][], updates: [string, string][]): [string, string][] {
    const byPath = new Map(entries); updates.forEach(([path, content]) => byPath.set(path, content))
    return [...byPath]
  }
}
