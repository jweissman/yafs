import { AbsolutePath } from '../core/AbsolutePath'
import { CtlHandler } from '../protocol/CtlDispatch'
import { MountManager } from '../mounts/MountManager'
import { AgentConfig, PreparedMountRecord } from '../mounts/types'
import { agentConfig } from './AgentManifest'

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void
type UnregisterCtl = (path: AbsolutePath) => void
type Invoke = (mountId: string, personaName: string, payload: string) => void

export function validAgentConfig(config: unknown): AgentConfig | undefined {
  try { return agentConfig(config) } catch { return undefined }
}

export class AgentRegistration {
  private registered = new Set<AbsolutePath>()
  private quarantined = new Set<string>()

  constructor(private readonly mounts: MountManager, private readonly registerCtl: RegisterCtl,
    private readonly unregisterCtl: UnregisterCtl, private readonly invoke: Invoke) {}

  close() { this.registered.forEach(path => this.unregisterCtl(path)); this.registered.clear() }

  sync() {
    const paths = new Set<AbsolutePath>(); this.mounts.mounts().forEach(record => this.registerAgent(record, paths))
    this.registered.forEach(path => { if (!paths.has(path)) this.unregisterCtl(path) }); this.registered = paths
  }

  private registerAgent(record: PreparedMountRecord, paths: Set<AbsolutePath>) {
    if (record.provider !== 'agent') return
    const config = validAgentConfig(record.config); if (!config) return this.registerInvalid(record)
    this.registerValid(record, config, paths)
  }

  private registerValid(record: PreparedMountRecord, config: AgentConfig, paths: Set<AbsolutePath>) {
    this.quarantined.delete(record.id)
    Object.keys(config.personas).forEach(name => this.registerPersona(record, name, paths))
  }

  private registerInvalid(record: PreparedMountRecord) {
    if (this.quarantined.has(record.id)) return
    this.quarantined.add(record.id)
    this.mounts.audit(record, 'system', 'quarantine', `Invalid persisted agent configuration: ${record.id}`)
  }

  private registerPersona(record: PreparedMountRecord, name: string, paths: Set<AbsolutePath>) {
    const path = `${record.path}/${name}/ctl` as AbsolutePath
    this.registerCtl(path, payload => this.invoke(record.id, name, payload)); paths.add(path)
  }
}
