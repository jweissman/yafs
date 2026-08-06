import { ProviderDefinition, PluginActionDefinition } from './ProviderDefinition'
import { SlackCollectionSource, SlackSnapshot } from './SlackCollectionSource'
import { SnapshotMaterializer } from './SnapshotMaterializer'
import { MountRecord, SlackConfig } from './types'

export function slackActions(): PluginActionDefinition[] {
  return [{ name: 'send', capability: 'network.slack-api', transport: 'ctl',
    pseudobinary: 'slack send PLUGIN_ID MESSAGE' }]
}

export function slackDefinition(source?: SlackCollectionSource): ProviderDefinition {
  return { name: 'slack', capabilities: () => ['network.slack-api', 'secret.slack-token'], actions: slackActions,
    prepare: (record, snapshots) => snapshot(source, record, snapshots) }
}

async function snapshot(source: SlackCollectionSource | undefined, record: MountRecord,
  snapshots: SnapshotMaterializer) {
  const captured = await required(source).snapshot(record.config as SlackConfig)
  return snapshots.prepare(fetchedRecord(record, captured), captured.entries)
}

function required(source?: SlackCollectionSource): SlackCollectionSource {
  if (!source) throw new Error('Slack provider is not configured'); return source
}

function fetchedRecord(record: MountRecord, snapshot: SlackSnapshot) {
  return { ...record, revision: snapshot.revision, fetchedAt: snapshot.fetchedAt }
}
