import { AbsolutePath } from '../core/AbsolutePath'
import { CtlHandler } from '../protocol/CtlDispatch'
import { Journal } from '../protocol/Journal'
import { MountManager } from '../mounts/MountManager'
import { AgentConfig, PersonaConfig, PreparedMountRecord } from '../mounts/types'
import { ModelClient } from './ChatCompletionClient'
import { AgentRunStore } from './AgentRunStore'
import { recoverAgentRuns } from './AgentRunRecovery'
import { AgentRunCancellation, cancelId } from './AgentRunCancellation'
import { agentError } from './AgentError'
import { AgentRequest, completeAgent, parseAgentRequest } from './AgentRequest'
import { agentConfig } from './AgentManifest'

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void
type UnregisterCtl = (path: AbsolutePath) => void
type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient
type AgentTarget = { config: AgentConfig, persona: PersonaConfig }

export class AgentDirectoryDriver {
  private readonly runs: AgentRunStore; private readonly cancels: AgentRunCancellation
  private registered = new Set<AbsolutePath>()

  constructor(private readonly mounts: MountManager, journal: Journal,
    enqueue: (work: () => Promise<void>) => Promise<void>, private readonly registerCtl: RegisterCtl,
    private readonly unregisterCtl: UnregisterCtl, private readonly modelFor: ModelFor) {
    this.runs = new AgentRunStore(mounts, journal, enqueue); this.cancels = new AgentRunCancellation(mounts, this.runs)
  }
  close() { this.registered.forEach(path => this.unregisterCtl(path)); this.registered.clear() }
  async recover() { return recoverAgentRuns(this.mounts, this.runs) }
  sync() {
    const paths = new Set<AbsolutePath>(); this.mounts.mounts().forEach(record => this.registerAgent(record, paths))
    this.registered.forEach(path => { if (!paths.has(path)) this.unregisterCtl(path) }); this.registered = paths
  }

  private registerAgent(record: PreparedMountRecord, paths: Set<AbsolutePath>) {
    if (record.provider !== 'agent') return
    const config = this.validConfig(record.config)
    if (config) Object.keys(config.personas).forEach(name => this.registerPersona(record, name, paths))
  }
  private validConfig(config: unknown) { try { return agentConfig(config) } catch { return undefined } }

  private registerPersona(record: PreparedMountRecord, name: string, paths: Set<AbsolutePath>) {
    const path = `${record.path}/${name}/ctl` as AbsolutePath
    this.registerCtl(path, payload => this.invoke(record.id, name, payload))
    paths.add(path)
  }

  private async invoke(mountId: string, personaName: string, payload: string) {
    const cancellation = cancelId(payload)
    if (cancellation) return this.cancels.cancel(mountId, personaName, cancellation)
    return this.invokeMessage(mountId, personaName, payload)
  }

  private async invokeMessage(mountId: string, personaName: string, payload: string) {
    const request = parseAgentRequest(payload); const target = this.persona(mountId, personaName)
    const { runId, startedAt } = await this.accept(mountId, personaName, request)
    void this.settle(target, mountId, personaName, runId, startedAt, request)
  }

  private async accept(mountId: string, personaName: string, request: AgentRequest) {
    const startedAt = new Date().toISOString(); const runId = startedAt.replace(/[:.]/g, '-')
    await this.runs.accept(mountId, personaName, runId, request.message, { state: 'queued', startedAt}, request.context)
    return { runId, startedAt }
  }

  private settle(target: AgentTarget, mountId: string, personaName: string, runId: string, startedAt: string,
    request: AgentRequest) { return this.startRun(mountId, personaName, runId, startedAt)
      .then(() => this.run(target, mountId, personaName, runId, startedAt, request)) }

  private async run(target: AgentTarget, mountId: string, personaName: string, runId: string, startedAt: string,
    request: AgentRequest) {
    try { await this.succeed(target, mountId, personaName, runId, startedAt, request) }
    catch (error) { await this.fail(mountId, personaName, runId, startedAt, error) }
  }

  private startRun(mountId: string, personaName: string, runId: string, startedAt: string) {
    return this.runs.writeStatus(mountId, personaName, runId, { state: 'running', startedAt })
  }

  private async succeed(target: AgentTarget, mountId: string,
    personaName: string, runId: string, startedAt: string, request: AgentRequest) {
    const reply = await completeAgent(this.modelFor(target.persona, target.config), target.persona, request)
    await this.finishUnlessCancelled(mountId, personaName, runId, startedAt, request.message, reply)
  }

  private finishUnlessCancelled(mountId: string, persona: string, runId: string, startedAt: string,
    message: string, reply: string) {
    if (!this.cancels.cancelledRun(mountId, runId)) return this.runs.finish(mountId, persona, runId, startedAt,
      message, reply)
  }

  private fail(mountId: string, personaName: string, runId: string, startedAt: string, error: unknown) {
    const completedAt = new Date().toISOString(); const detail = agentError(error)
    return this.runs.writeStatus(mountId, personaName, runId, { state: 'failed', startedAt, completedAt, error: detail })
  }

  private persona(mountId: string, personaName: string) {
    const record = this.record(mountId); this.assertGranted(record)
    const config = this.configuredAgent(record); const persona = config.personas[personaName]
    if (!persona) throw new Error(`No such persona: ${personaName}`); return { config, persona }
  }

  private configuredAgent(record: PreparedMountRecord) {
    const config = this.validConfig(record.config)
    if (!config) throw new Error(`Invalid persisted agent configuration: ${record.id}`)
    return config
  }

  private record(mountId: string): PreparedMountRecord {
    const record = this.mounts.mounts().find(item => item.id === mountId)
    if (!record) throw new Error(`No such mount: ${mountId}`); return record
  }

  private assertGranted(record: PreparedMountRecord) {
    if (!record.capabilities.includes('chat.completion')) throw new Error(`chat.completion is not granted: ${record.id}`)
  }

}
