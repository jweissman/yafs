import { FixtureProvider } from './FixtureProvider'
import { GitHubCollectionSource } from './GitHubCollectionSource'
import { SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, PreparedMountRecord } from './types'

export class ProviderRegistry {
  constructor(private readonly github?: GitHubCollectionSource,
    private readonly authenticatedGithub?: GitHubCollectionSource) {}

  assertGranted(record: { provider: string, capabilities: string[] }) {
    const allowed = record.provider === 'github' ? this.githubCapabilities() : []
    const denied = record.capabilities.filter(capability => !allowed.includes(capability))
    if (denied.length) throw new Error(`Capabilities are not granted: ${denied.join(', ')}`)
  }

  prepare(record: MountRecord, snapshots: SnapshotMaterializer): PreparedMountRecord | Promise<PreparedMountRecord> {
    if (record.provider === 'fixture') return this.fixtureSnapshot(record, snapshots)
    return this.githubSnapshot(record, snapshots)
  }

  private fixtureSnapshot(record: MountRecord, snapshots: SnapshotMaterializer) {
    const config = record.config as import('./types').FixtureConfig
    return snapshots.prepare(record, FixtureProvider.from(config).entries())
  }

  private async githubSnapshot(record: MountRecord, snapshots: SnapshotMaterializer) {
    const source = this.githubSource(record)
    const snapshot = await source.snapshot(record.config as import('./types').GitHubConfig)
    return snapshots.prepare(this.fetchedRecord(record, snapshot), snapshot.entries)
  }

  private githubCapabilities() {
    return ['network.github-api', ...(this.authenticatedGithub ? ['secret.github-token'] : [])]
  }
  private githubSource(record: MountRecord) {
    const source = record.capabilities.includes('secret.github-token') ? this.authenticatedGithub : this.github
    if (!source) throw new Error('GitHub provider is not configured')
    return source
  }

  private fetchedRecord(record: MountRecord, snapshot: import('./GitHubCollectionSource').ProviderSnapshot) {
    return { ...record, revision: snapshot.revision, fetchedAt: snapshot.fetchedAt }
  }
}
