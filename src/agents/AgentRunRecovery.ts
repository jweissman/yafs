import { MountManager } from '../mounts/MountManager'
import { PreparedMountRecord } from '../mounts/types'
import { AgentRunStore } from './AgentRunStore'

export async function recoverAgentRuns(mounts: MountManager, runs: AgentRunStore) {
  for (const record of mounts.mounts()) await recoverRecord(record, runs)
}

async function recoverRecord(record: PreparedMountRecord, runs: AgentRunStore) {
  if (record.provider !== 'agent') return
  for (const [path, content] of record.snapshot.entries) await interrupt(record.id, path, content, runs)
}

async function interrupt(mountId: string, path: string, content: string, runs: AgentRunStore) {
  const run = running(path, content); if (!run) return
  await runs.interrupt(mountId, run.persona, run.id, { state: 'interrupted', startedAt: run.startedAt,
    completedAt: new Date().toISOString(), error: 'Daemon restarted before completion' })
}

function running(path: string, content: string) {
  const match = /^([^/]+)\/runs\/([^/]+)\/status\.json$/.exec(path); if (!match) return undefined
  const status = JSON.parse(content) as { state?: string, startedAt?: unknown }
  return runningStatus(status) ? { persona: match[1], id: match[2], startedAt: status.startedAt } : undefined
}

function runningStatus(status: { state?: string, startedAt?: unknown }): status is { state: 'queued' | 'running', startedAt: string } {
  return (status.state === 'queued' || status.state === 'running') && typeof status.startedAt === 'string'
}
