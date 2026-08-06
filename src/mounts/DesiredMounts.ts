import { readFile } from 'node:fs/promises'

import { AbsolutePath } from '../core/AbsolutePath'
import { agentConfig } from '../agents/AgentManifest'
import { parseManifest } from './Manifest'
import { MountManager } from './MountManager'
import { Change, DesiredMountChanges } from './DesiredMountChanges'
import { ManifestMount, PreparedMountRecord } from './types'

type Mutations = {
  mount(record: PreparedMountRecord): void
  refresh(record: PreparedMountRecord): void
  unmount(id: string): void
}
type DesiredMountsOptions = { path?: string, root?: AbsolutePath }

export class DesiredMounts {
  private readonly path?: string
  private readonly root: AbsolutePath
  private readonly planner: DesiredMountChanges

  constructor(private readonly mounts: MountManager, options: DesiredMountsOptions = {}) {
    this.path = options.path; this.root = options.root || '/home/root'
    this.planner = new DesiredMountChanges(this.root)
  }

  async status() { return this.report(await this.loaded()) }
  async plan() { const loaded = await this.loaded(); return loaded ? this.changesFor(loaded) : [] }
  async apply(mutations: Mutations, prune = false) {
    const loaded = await this.required(); const changes = this.changesFor(loaded, prune)
    for (const change of changes) await this.applyChange(change, loaded.manifest.mounts, mutations)
    return changes
  }
  async refreshOne(id: string, mutations: Mutations) {
    const loaded = await this.required(); const change: Change = { id, action: this.forcedAction(id) }
    await this.applyChange(change, loaded.manifest.mounts, mutations); return change
  }

  private changesFor(loaded: NonNullable<ReturnType<DesiredMounts['parse']>>, prune = false) {
    return this.planner.plan(this.mounts.mounts(), loaded.manifest.mounts, prune)
  }

  private forcedAction(id: string): 'activate' | 'refresh' {
    return this.mounts.mounts().some(record => record.id === id) ? 'refresh' : 'activate'
  }

  private async applyChange(change: Change, declarations: ManifestMount[], mutations: Mutations) {
    if (change.action === 'unmount') { mutations.unmount(change.id); return }
    return this.publish(change, declarations, mutations)
  }

  private async publish(change: Change, declarations: ManifestMount[], mutations: Mutations) {
    const record = this.recordFor(declarations, change.id)
    return Promise.resolve(this.mounts.prepareActivation(record, 'system'))
      .then(prepared => this.publishPrepared(change, mutations, prepared))
  }

  private recordFor(declarations: ManifestMount[], id: string) {
    return this.mounts.planDesired(this.declaration(declarations, id), this.digest(declarations), this.root)
  }

  private publishPrepared(change: Change, mutations: Mutations, record: PreparedMountRecord) {
    if (change.action === 'activate') mutations.mount(record); else mutations.refresh(record)
  }

  private declaration(declarations: ManifestMount[], id: string) {
    const declaration = declarations.find(item => item.id === id)
    if (!declaration) throw new Error(`No desired mount: ${id}`); return declaration
  }

  private digest(declarations: ManifestMount[]) { return JSON.stringify(declarations) }
  private async required() { const loaded = await this.loaded(); if (!loaded) throw new Error('No daemon mount configuration')
    return loaded }
  private async loaded() { return this.path ? this.parse(await this.read()) : undefined }
  private async read() { try { return await readFile(this.path!, 'utf8') } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error } }
  private parse(source: string | undefined) { return source && parseManifest(source) }
  private report(loaded: ReturnType<DesiredMounts['parse']>) {
    return { configured: Boolean(loaded), changes: loaded ? this.changesFor(loaded) : [], active: this.active() }
  }
  private active() { return this.mounts.mounts().map(record => this.activeEntry(record)) }

  private activeEntry(record: PreparedMountRecord) {
    const entry = { id: record.id, plugin: record.provider, path: record.path, state: record.state }
    return this.quarantined(record) ? { ...entry, quarantined: true } : entry
  }

  private quarantined(record: PreparedMountRecord) {
    if (record.provider !== 'agent') return false
    try { agentConfig(record.config); return false } catch { return true }
  }
}
