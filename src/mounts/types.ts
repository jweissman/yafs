import { AbsolutePath } from '../core/AbsolutePath'

export type MountState = 'active' | 'failed'
export type FixtureConfig = { files: Record<string, string> }
export type MountConfig = FixtureConfig
export type PublishedSnapshot = { entries: [string, string][], fileCount: number, byteCount: number }

export type MountRecord = {
  id: string, path: AbsolutePath, provider: 'fixture', config: MountConfig,
  manifestPath: AbsolutePath, manifestDigest: string, revision: string,
  state: MountState, activatedAt: string, capabilities: string[]
}
export type PreparedMountRecord = MountRecord & { snapshot: PublishedSnapshot }

export type ManifestMount = { id: string, path: string, provider: 'fixture', config: MountConfig, capabilities: string[] }
export type Manifest = { version: 1, mounts: ManifestMount[] }

export type Provenance = {
  kind: 'local' | 'provider', path: string, mountId?: string, provider?: string,
  revision?: string, activatedAt?: string
}
