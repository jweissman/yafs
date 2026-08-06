import { ProviderDefinition, PluginActionDefinition, PluginExposureDefinition } from '../mounts/ProviderDefinition'
import { carryForward } from '../mounts/SnapshotCarryForward'
import { SnapshotMaterializer } from '../mounts/SnapshotMaterializer'
import { AgentConfig, MountRecord, PreparedMountRecord } from '../mounts/types'

export function agentActions(): PluginActionDefinition[] {
  return [{ name: 'send', capability: 'chat.completion', transport: 'ctl',
    pseudobinary: 'agent send PERSONA [--context PATH] MESSAGE' }]
}

export function agentExposures(): PluginExposureDefinition[] {
  return [{ name: 'conversation', protocol: 'http', status: 'designed' }]
}

export function agentDefinition(): ProviderDefinition {
  return { name: 'agent', capabilities: () => ['chat.completion'], actions: agentActions,
    exposures: agentExposures, prepare: agentSnapshot }
}

function agentSnapshot(record: MountRecord, snapshots: SnapshotMaterializer, current?: PreparedMountRecord) {
  const config = record.config as AgentConfig
  const fresh = Object.entries(config.personas).map(([name, persona]): [string, string] => [`${name}/prompt.md`, persona.prompt])
  return snapshots.prepare(record, carryForward(fresh, current, path => path.includes('/runs/')))
}
