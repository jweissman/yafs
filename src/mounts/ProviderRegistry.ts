import { FixtureProvider } from './FixtureProvider'
import { GitHubCollectionSource } from './GitHubCollectionSource'
import { SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, PreparedMountRecord } from './types'
import { ProviderDefinition } from './ProviderDefinition'
import { describePlugins, PluginDescription } from './PluginDescriptions'
import { agentActions, agentExposures } from '../agents/AgentPlugin'

export class ProviderRegistry {
  private readonly definitions: Map<string, ProviderDefinition>

  constructor(private readonly github?: GitHubCollectionSource,
    private readonly authenticatedGithub?: GitHubCollectionSource) {
    this.definitions = new Map(this.providerDefinitions().map(definition => [definition.name, definition]))
  }

  assertGranted(record: { provider: string, capabilities: string[] }) {
    const denied = record.capabilities.filter(capability => !this.allowed(record.provider, capability))
    if (denied.length) throw new Error(`Capabilities are not granted: ${denied.join(', ')}`)
  }

  describe(name?: string): PluginDescription[] {
    return describePlugins(this.definitions, name)
  }

  private allowed(provider: string, capability: string) {
    return this.definition(provider).capabilities().includes(capability)
  }

  prepare(record: MountRecord, snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord): PreparedMountRecord | Promise<PreparedMountRecord> {
    return this.definition(record.provider).prepare(record, snapshots, current)
  }

  private definition(name: string) {
    const definition = this.definitions.get(name)
    if (!definition) throw new Error(`Unknown provider: ${name}`); return definition
  }

  private providerDefinitions(): ProviderDefinition[] {
    return [this.fixtureDefinition(), this.agentDefinition(), this.githubDefinition()]
  }

  private fixtureDefinition(): ProviderDefinition {
    return { name: 'fixture', capabilities: () => [], prepare: this.fixtureSnapshot.bind(this) }
  }

  private agentDefinition(): ProviderDefinition {
    return { name: 'agent', capabilities: () => ['chat.completion'], actions: agentActions,
      exposures: agentExposures, prepare: this.agentSnapshot.bind(this) }
  }

  private githubDefinition(): ProviderDefinition {
    return { name: 'github', capabilities: () => this.githubCapabilities(), prepare: this.githubSnapshot.bind(this) }
  }

  private fixtureSnapshot(record: MountRecord, snapshots: SnapshotMaterializer, current?: PreparedMountRecord) {
    const config = record.config as import('./types').FixtureConfig
    const fresh = FixtureProvider.from(config).entries()
    return snapshots.prepare(record, this.carryForward(fresh, current, path => Boolean(config.streams?.[path])))
  }

  private agentSnapshot(record: MountRecord, snapshots: SnapshotMaterializer, current?: PreparedMountRecord) {
    const config = record.config as import('./types').AgentConfig
    const fresh = Object.entries(config.personas).map(([name, persona]): [string, string] => [`${name}/prompt.md`, persona.prompt])
    return snapshots.prepare(record, this.carryForward(fresh, current, path => path.includes('/runs/')))
  }

  private carryForward(fresh: [string, string][], current: PreparedMountRecord | undefined,
    owned: (path: string) => boolean): [string, string][] {
    if (!current) return fresh
    const merged = new Map(fresh); this.applyOwned(merged, current.snapshot.entries, owned); return [...merged]
  }

  private applyOwned(target: Map<string, string>, entries: [string, string][], owned: (path: string) => boolean) {
    entries.filter(([path]) => owned(path)).forEach(([path, content]) => target.set(path, content))
  }

  private async githubSnapshot(record: MountRecord, snapshots: SnapshotMaterializer) {
    const source = this.githubSource(record)
    const snapshot = await source.snapshot(record.config as import('./types').GitHubConfig)
    return snapshots.prepare(this.fetchedRecord(record, snapshot), snapshot.entries, snapshot.resourceReferences)
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
