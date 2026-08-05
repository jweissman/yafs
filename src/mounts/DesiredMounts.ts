import { readFile } from 'node:fs/promises'

import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { parseManifest } from './Manifest'
import { MountManager } from './MountManager'
import { ManifestMount, PreparedMountRecord } from './types'

type Mutations = {
  mount(record: PreparedMountRecord): void
  refresh(record: PreparedMountRecord): void
  unmount(id: string): void
}
type Change = { id: string, action: 'activate' | 'refresh' | 'unmount' }
type DesiredMountsOptions = { path?: string, root?: AbsolutePath }

export class DesiredMounts {
  private readonly path?: string
  private readonly root: AbsolutePath

  constructor(private readonly mounts: MountManager, options: DesiredMountsOptions = {}) {
    this.path = options.path; this.root = options.root || '/home/root'
  }

  async status() { return this.report(await this.loaded()) }
  async plan() { const loaded = await this.loaded(); return loaded ? this.changes(loaded) : [] }
  async apply(mutations: Mutations, prune = false) {
    const loaded = await this.required(); const changes = this.changes(loaded, prune)
    for (const change of changes) await this.applyChange(change, loaded.manifest.mounts, mutations)
    return changes
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
    return { configured: Boolean(loaded), changes: loaded ? this.changes(loaded) : [], active: this.active() }
  }
  private active() { return this.mounts.mounts().map(record => ({ id: record.id, plugin: record.provider,
    path: record.path, state: record.state })) }
  private changes(loaded: NonNullable<ReturnType<DesiredMounts['parse']>>, prune = false): Change[] {
    const active = this.mounts.mounts(); const declared = loaded.manifest.mounts
    this.assertUnique(declared)
    return [...this.declaredChanges(declared, active), ...this.removals(declared, active, prune)]
  }

  private assertUnique(declared: ManifestMount[]) {
    if (new Set(declared.map(item => item.id)).size !== declared.length) throw new Error('Duplicate desired mount id')
  }

  private declaredChanges(declared: ManifestMount[], active: PreparedMountRecord[]): Change[] {
    return declared.flatMap(item => this.change(item, active.find(record => record.id === item.id)))
  }

  private change(item: ManifestMount, active: PreparedMountRecord | undefined): Change[] {
    if (!active) return [{ id: item.id, action: 'activate' }]
    return this.matches(item, active) ? [] : [{ id: item.id, action: 'refresh' }]
  }

  private matches(item: ManifestMount, active: PreparedMountRecord) {
    return JSON.stringify(this.activeShape(active)) === JSON.stringify(this.declaredShape(item))
  }

  private activeShape(record: PreparedMountRecord) {
    return [record.path, record.provider, record.config, record.capabilities, record.refreshIntervalMs]
  }

  private declaredShape(item: ManifestMount) {
    return [PathResolver.resolve(item.path, this.root), item.provider, item.config,
      item.capabilities, item.refreshIntervalMs]
  }

  private removals(declared: ManifestMount[], active: PreparedMountRecord[], prune: boolean): Change[] {
    if (!prune) return []
    return active.filter(record => !declared.some(item => item.id === record.id))
      .map(record => ({ id: record.id, action: 'unmount' as const }))
  }
}
