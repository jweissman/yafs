import { dirname } from 'node:path'

import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { NodeStore } from '../vfs/NodeStore'
import { parseManifest } from './Manifest'
import { ManifestMount, MountRecord } from './types'

type Details = { declaration: ManifestMount, digest: string }

export class MountPlanner {
  constructor(private readonly store: NodeStore, private readonly records: () => MountRecord[]) {}

  validate(path: AbsolutePath) { return parseManifest(this.store.read(path)) }

  plan(path: AbsolutePath, id?: string): MountRecord {
    const { declaration, digest } = this.details(path, id)
    this.assertGranted(declaration.capabilities)
    return this.record(path, declaration, digest)
  }

  private details(path: AbsolutePath, id?: string): Details {
    const { manifest, digest } = this.validate(path)
    return { declaration: this.declaration(manifest.mounts, id), digest }
  }

  private declaration(mounts: ManifestMount[], id?: string) {
    const selected = mounts.filter(mount => !id || mount.id === id)
    if (selected.length !== 1) throw new Error('Expected exactly one declared mount')
    return selected[0]
  }

  private assertGranted(capabilities: string[]) {
    if (capabilities.length) throw new Error(`Capabilities are not granted: ${capabilities.join(', ')}`)
  }

  private record(manifestPath: AbsolutePath, mount: ManifestMount, digest: string): MountRecord {
    const path = PathResolver.resolve(mount.path, dirname(manifestPath) as AbsolutePath)
    this.assertAvailable(path)
    return this.activeRecord(path, manifestPath, mount, digest)
  }

  private activeRecord(path: AbsolutePath, manifestPath: AbsolutePath, mount: ManifestMount,
    digest: string): MountRecord {
    return { ...this.identity(path, mount), ...this.metadata(manifestPath, digest),
      state: 'active', activatedAt: new Date().toISOString(), capabilities: mount.capabilities }
  }

  private identity(path: AbsolutePath, mount: ManifestMount) {
    return { id: mount.id, path, provider: mount.provider, config: mount.config }
  }

  private metadata(manifestPath: AbsolutePath, digest: string) {
    return { manifestPath, manifestDigest: digest, revision: `fixture:${digest.slice(0, 12)}` }
  }

  private assertAvailable(path: AbsolutePath) {
    if (this.store.get(path, false)) throw new Error(`Mount path already exists: ${path}`)
    if (this.records().some(record => record.path === path)) throw new Error(`Mount already active: ${path}`)
    if (this.overlaps(path)) throw new Error(`Overlapping mount: ${path}`)
  }

  private overlaps(path: AbsolutePath) {
    return this.records().some(record => path.startsWith(`${record.path}/`)
      || record.path.startsWith(`${path}/`))
  }
}
