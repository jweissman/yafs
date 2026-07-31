import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MountRecord } from './types'

type StoredMounts = { version: 1, mounts: MountRecord[] }

export class MountPersistence {
  private sequence = 0

  constructor(private readonly statePath?: string, private readonly auditPath?: string) {
    this.sequence = auditSequence(auditPath)
  }

  restore(): MountRecord[] {
    return this.statePath && existsSync(this.statePath) ? this.parse(this.statePath) : []
  }

  save(mounts: MountRecord[]) {
    if (!this.statePath) return
    writeMounts(this.statePath, mounts)
  }

  audit(record: MountRecord, actor: string, action: string, before?: string, after?: string) {
    if (!this.auditPath) return
    mkdirSync(dirname(this.auditPath), { recursive: true })
    appendSynced(this.auditPath, `${JSON.stringify(this.event(record, actor, action, before, after))}\n`)
  }

  private parse(path: string) { return valid(JSON.parse(readFileSync(path, 'utf8')) as StoredMounts) }

  private event(record: MountRecord, actor: string, action: string, before?: string,
    after?: string) {
    const sequence = ++this.sequence
    return this.eventDetails(record, actor, action, before, after, sequence)
  }

  private eventDetails(record: MountRecord, actor: string, action: string, before: string | undefined,
    after: string | undefined, sequence: number) {
    return this.eventData(record, actor, action, before, after, sequence)
  }

  private eventData(record: MountRecord, actor: string, action: string, before: string | undefined,
    after: string | undefined, sequence: number) {
    return { ...this.eventIdentity(record, actor, sequence), action, relativePath: '',
      capabilitiesUsed: [], outcome: 'success', beforeRevision: before, afterRevision: after }
  }

  private eventIdentity(record: MountRecord, actor: string, sequence: number) {
    return { sequence, at: new Date().toISOString(), actor, mountId: record.id,
      provider: record.provider, correlationId: `${record.id}:${sequence}` }
  }
}

function valid(stored: StoredMounts) {
  if (stored.version !== 1 || !Array.isArray(stored.mounts)) throw new Error('Invalid mount state')
  return stored.mounts
}

function writeMounts(path: string, mounts: MountRecord[]) {
  mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.tmp`
  writeSynced(temporary, JSON.stringify({ version: 1, mounts } satisfies StoredMounts))
  renameSync(temporary, path); syncDirectory(path)
}

function writeSynced(path: string, data: string) {
  const descriptor = openSync(path, 'w')
  try { writeFileSync(descriptor, data); fsyncSync(descriptor) }
  finally { closeSync(descriptor) }
}

function appendSynced(path: string, data: string) {
  const descriptor = openSync(path, 'a')
  try { writeFileSync(descriptor, data); fsyncSync(descriptor) }
  finally { closeSync(descriptor) }
}

function syncDirectory(path: string) {
  const descriptor = openSync(dirname(path), 'r')
  try { fsyncSync(descriptor) }
  finally { closeSync(descriptor) }
}

function auditSequence(path?: string) {
  if (!path || !existsSync(path)) return 0
  const last = readFileSync(path, 'utf8').trim().split('\n').at(-1)
  return last ? Number((JSON.parse(last) as { sequence: number }).sequence) : 0
}
