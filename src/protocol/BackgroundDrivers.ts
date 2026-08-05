import { AbsolutePath } from '../core/AbsolutePath'
import { MountManager } from '../mounts/MountManager'
import { AgentConfig, PersonaConfig } from '../mounts/types'
import { FixtureStreamDriver } from '../mounts/FixtureStreamDriver'
import { AgentDirectoryDriver } from '../agents/AgentDirectoryDriver'
import { ModelClient } from '../agents/ChatCompletionClient'
import { ServerRefresh } from './ServerRefresh'
import { CtlHandler } from './CtlDispatch'
import { Journal } from './Journal'

type Enqueue = (work: () => Promise<void>) => Promise<void>
type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void
type UnregisterCtl = (path: AbsolutePath) => void
export type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient

export type BackgroundDrivers = { refreshes: ServerRefresh, streams: FixtureStreamDriver, agents: AgentDirectoryDriver }

function refreshAndStreams(mounts: MountManager, journal: Journal, enqueue: Enqueue, registerCtl: RegisterCtl,
  unregisterCtl: UnregisterCtl, now?: () => number) {
  return { refreshes: new ServerRefresh(mounts, journal, enqueue, now),
    streams: new FixtureStreamDriver(mounts, journal, enqueue, registerCtl, unregisterCtl) }
}

export function backgroundDrivers(mounts: MountManager, journal: Journal, enqueue: Enqueue,
  registerCtl: RegisterCtl, unregisterCtl: UnregisterCtl, modelFor: ModelFor, now?: () => number): BackgroundDrivers {
  const agents = new AgentDirectoryDriver(mounts, journal, enqueue, registerCtl, unregisterCtl, modelFor)
  return { ...refreshAndStreams(mounts, journal, enqueue, registerCtl, unregisterCtl, now), agents }
}

export function startAll(drivers: BackgroundDrivers) {
  drivers.refreshes.start(); drivers.streams.start(); drivers.agents.sync()
}

export function closeAll(drivers: BackgroundDrivers) {
  drivers.refreshes.close(); drivers.streams.close(); drivers.agents.close()
}

export function syncAll(drivers: BackgroundDrivers) { drivers.streams.sync(); drivers.agents.sync() }
export function recoverAll(drivers: BackgroundDrivers) { return drivers.agents.recover() }
