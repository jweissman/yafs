import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { NodeStore } from '../vfs/NodeStore'
import { FixtureProvider } from './FixtureProvider'
import { parseManifest } from './Manifest'
import { ManifestMount, MountRecord, Provenance } from './types'

type AuditEvent = {
  sequence: number, at: string, actor: string, mountId: string, provider: string,
  action: string, relativePath: string, capabilitiesUsed: string[], outcome: string,
  beforeRevision?: string, afterRevision?: string, correlationId: string
}
type DurableMounts = { version: 1, mounts: MountRecord[] }
type ActivationDetails = { declaration: ManifestMount, digest: string }
type ActiveRecordDetails = { manifestPath: AbsolutePath, mount: ManifestMount, digest: string }
type MountMetadata = Pick<MountRecord, 'manifestPath' | 'manifestDigest' | 'revision'>
type MountStateData = Pick<MountRecord, 'state' | 'activatedAt' | 'capabilities'>
type AuditDetails = Omit<AuditEvent, 'sequence' | 'at' | 'actor' | 'mountId' | 'provider'>
type AuditInput = Pick<AuditEvent, 'action' | 'outcome' | 'beforeRevision' | 'afterRevision'>

export class MountManager {
  private records: MountRecord[] = []
  private sequence = 0

  constructor(private readonly store: NodeStore, private readonly statePath?: string,
    private readonly auditPath?: string) { this.restore() }

  validate(path: AbsolutePath) { return parseManifest(this.store.read(path)) }

  planActivation(path: AbsolutePath, id?: string): MountRecord {
    const { declaration, digest } = this.activationDetails(path, id)
    this.assertGranted(declaration.capabilities)
    return this.record(path, declaration, digest)
  }

  private activationDetails(path: AbsolutePath, id?: string): ActivationDetails {
    const { manifest, digest } = this.validate(path)
    return { declaration: this.declaration(manifest.mounts, id), digest }
  }

  activate(record: MountRecord, actor: string) {
    this.add(record)
    this.audit(record, actor, this.activation(record))
  }

  planUnmount(id: string) {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error(`No active mount: ${id}`)
    return record
  }

  unmount(id: string, actor: string) {
    const record = this.planUnmount(id)
    this.records = this.records.filter(item => item !== record)
    this.persist(); this.audit(record, actor, this.unmountEvent(record))
  }

  restoreOperation(record: MountRecord) {
    if (!this.contains(record)) this.add(record)
  }

  private contains(record: MountRecord) {
    return this.records.some(item => item.id === record.id && item.path === record.path)
  }

  restoreUnmount(id: string) {
    this.records = this.records.filter(record => record.id !== id); this.persist()
  }

  read(path: AbsolutePath): string | undefined {
    const match = this.match(path)
    return match && FixtureProvider.from(match.record.config).read(match.relative)
  }

  list(path: AbsolutePath, local: string[]): string[] {
    const match = this.match(path)
    if (match) return FixtureProvider.from(match.record.config).list(match.relative)
    return [...local, ...this.children(path).filter(name => !local.includes(name))]
  }

  type(path: AbsolutePath): 'file' | 'directory' | undefined {
    const match = this.match(path)
    if (match) return FixtureProvider.from(match.record.config).type(match.relative)
    return this.children(path).length ? 'directory' : undefined
  }

  provenance(path: AbsolutePath): Provenance[] | undefined {
    const match = this.match(path); if (!match) return undefined
    return [{ kind: 'provider', path, mountId: match.record.id, provider: match.record.provider,
      revision: match.record.revision, activatedAt: match.record.activatedAt }]
  }

  assertWritable(path: AbsolutePath) {
    if (this.match(path)) throw new Error(`Read-only mount: ${path}`)
  }

  mounts() { return [...this.records] }

  private declaration(mounts: ManifestMount[], id?: string) {
    const selected = mounts.filter(mount => !id || mount.id === id)
    if (selected.length !== 1) throw new Error('Expected exactly one declared mount')
    return selected[0]
  }

  private assertGranted(capabilities: string[]) {
    if (capabilities.length) throw new Error(`Capabilities are not granted: ${capabilities.join(', ')}`)
  }

  private record(manifestPath: AbsolutePath, mount: ManifestMount, digest: string): MountRecord {
    const path = this.resolveMount(manifestPath, mount.path)
    this.assertAvailable(path)
    return this.activeRecord(path, { manifestPath, mount, digest })
  }

  private activeRecord(path: AbsolutePath, details: ActiveRecordDetails): MountRecord {
    const { mount } = details
    const metadata = this.recordMetadata(details); const state = this.activeState(mount)
    return this.composeRecord(path, mount, metadata, state)
  }

  private composeRecord(path: AbsolutePath, mount: ManifestMount,
    metadata: MountMetadata, state: MountStateData): MountRecord {
    return { id: mount.id, path, provider: mount.provider, config: mount.config, ...metadata,
      ...state }
  }

  private recordMetadata({ manifestPath, digest }: ActiveRecordDetails) {
    return { manifestPath, manifestDigest: digest, revision: this.revision(digest) }
  }

  private activeState(mount: ManifestMount) {
    return { state: 'active' as const, activatedAt: new Date().toISOString(),
      capabilities: mount.capabilities }
  }

  private revision(digest: string) { return `fixture:${digest.slice(0, 12)}` }

  private resolveMount(manifestPath: AbsolutePath, path: string) {
    return PathResolver.resolve(path, dirname(manifestPath) as AbsolutePath)
  }

  private assertAvailable(path: AbsolutePath) {
    if (this.records.some(record => record.path === path)) throw new Error(`Mount already active: ${path}`)
    if (this.overlaps(path)) throw new Error(`Overlapping mount: ${path}`)
  }

  private overlaps(path: AbsolutePath) {
    return this.records.some(record => path.startsWith(`${record.path}/`) || record.path.startsWith(`${path}/`))
  }

  private add(record: MountRecord) { this.records.push(record); this.persist() }

  private children(path: AbsolutePath) {
    return this.records.filter(record => dirname(record.path) === path)
      .map(record => record.path.split('/').at(-1)!)
  }

  private match(path: AbsolutePath) {
    const record = this.matchingRecord(path)
    return record && { record, relative: path.slice(record.path.length).replace(/^\//, '') }
  }

  private matchingRecord(path: AbsolutePath) {
    return [...this.records].sort((left, right) => right.path.length - left.path.length)
      .find(item => path === item.path || path.startsWith(`${item.path}/`))
  }

  private audit(record: MountRecord, actor: string, input: AuditInput) {
    if (!this.auditPath) return
    appendFileSync(this.auditPath, `${JSON.stringify(this.auditEvent(record, actor,
      this.auditDetails(record, input)))}\n`)
  }

  private activation(record: MountRecord): AuditInput {
    return { action: 'activation', outcome: 'success', afterRevision: record.revision }
  }

  private unmountEvent(record: MountRecord): AuditInput {
    return { action: 'unmount', outcome: 'success', beforeRevision: record.revision }
  }

  private auditEvent(record: MountRecord, actor: string, details: AuditDetails): AuditEvent {
    return { sequence: ++this.sequence, at: new Date().toISOString(), actor,
      mountId: record.id, provider: record.provider, ...details }
  }

  private auditDetails(record: MountRecord, input: AuditInput): AuditDetails {
    return { ...input, relativePath: '', capabilitiesUsed: [],
      correlationId: `${record.id}:${this.sequence + 1}` }
  }

  private persist() {
    if (!this.statePath) return
    this.writeState(this.statePath)
  }

  private writeState(path: string) {
    mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.tmp`
    writeFileSync(temporary, this.serializedMounts()); renameSync(temporary, path)
  }

  private serializedMounts() {
    return JSON.stringify({ version: 1, mounts: this.records } satisfies DurableMounts)
  }

  private restore() {
    if (!this.statePath || !existsSync(this.statePath)) return
    this.restoreStored(JSON.parse(readFileSync(this.statePath, 'utf8')) as DurableMounts)
  }

  private restoreStored(stored: DurableMounts) {
    if (stored.version !== 1 || !Array.isArray(stored.mounts)) throw new Error('Invalid mount state')
    this.records = stored.mounts; this.sequence = auditSequence(this.auditPath)
  }
}

function auditSequence(path?: string) {
  if (!path || !existsSync(path)) return 0
  const last = readFileSync(path, 'utf8').trim().split('\n').at(-1)
  return last ? auditRecord(JSON.parse(last)) : 0
}

function auditRecord(value: unknown) {
  const sequence = (value as { sequence?: unknown }).sequence
  if (!validSequence(sequence)) throw new Error('Invalid audit state')
  return sequence
}

function validSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
