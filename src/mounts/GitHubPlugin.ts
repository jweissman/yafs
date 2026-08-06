import { GitHubCollectionSource, ProviderSnapshot } from './GitHubCollectionSource'
import { ProviderDefinition } from './ProviderDefinition'
import { SnapshotMaterializer } from './SnapshotMaterializer'
import { GitHubConfig, MountRecord } from './types'

type Sources = { github?: GitHubCollectionSource, authenticatedGithub?: GitHubCollectionSource }

export function githubDefinition(sources: Sources): ProviderDefinition {
  return { name: 'github', capabilities: () => capabilities(sources.authenticatedGithub),
    prepare: (record, snapshots) => snapshot(sources, record, snapshots) }
}

function capabilities(authenticatedGithub?: GitHubCollectionSource) {
  return ['network.github-api', ...(authenticatedGithub ? ['secret.github-token'] : [])]
}

async function snapshot(sources: Sources, record: MountRecord, snapshots: SnapshotMaterializer) {
  const source = requiredSource(sources, record); const captured = await source.snapshot(record.config as GitHubConfig)
  return snapshots.prepare(fetchedRecord(record, captured), captured.entries, captured.resourceReferences)
}

function requiredSource(sources: Sources, record: MountRecord) {
  const source = record.capabilities.includes('secret.github-token') ? sources.authenticatedGithub : sources.github
  if (!source) throw new Error('GitHub provider is not configured')
  return source
}

function fetchedRecord(record: MountRecord, snapshot: ProviderSnapshot) {
  return { ...record, revision: snapshot.revision, fetchedAt: snapshot.fetchedAt }
}
