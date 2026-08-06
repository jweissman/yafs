import { AbsolutePath } from '../core/AbsolutePath'
import { MountManager } from '../mounts/MountManager'
import { AgentConfig, PersonaConfig, SlackConfig } from '../mounts/types'
import { FixtureStreamDriver } from '../mounts/FixtureStreamDriver'
import { AgentDirectoryDriver } from '../agents/AgentDirectoryDriver'
import { ModelClient } from '../agents/ChatCompletionClient'
import { SlackDirectoryDriver, SlackPoster } from '../mounts/SlackDirectoryDriver'
import { ServerRefresh } from './ServerRefresh'
import { CtlHandler } from './CtlDispatch'
import { Journal } from './Journal'

type Enqueue = (work: () => Promise<void>) => Promise<void>
type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void
type UnregisterCtl = (path: AbsolutePath) => void
export type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient
export type SlackClientFor = (config: SlackConfig) => SlackPoster
export type Wiring = { mounts: MountManager, journal: Journal, enqueue: Enqueue, registerCtl: RegisterCtl,
  unregisterCtl: UnregisterCtl }

export type BackgroundDrivers = { refreshes: ServerRefresh, streams: FixtureStreamDriver,
  agents: AgentDirectoryDriver, slack: SlackDirectoryDriver }

function refreshAndStreams(wiring: Wiring, now?: () => number, refreshIntervalMs?: number) {
  const { mounts, journal, enqueue, registerCtl, unregisterCtl } = wiring
  return { refreshes: new ServerRefresh(mounts, journal, enqueue, now, refreshIntervalMs),
    streams: new FixtureStreamDriver(mounts, journal, enqueue, registerCtl, unregisterCtl) }
}

export function backgroundDrivers(wiring: Wiring, modelFor: ModelFor, slackClientFor: SlackClientFor,
  now?: () => number, refreshIntervalMs?: number): BackgroundDrivers {
  return { ...refreshAndStreams(wiring, now, refreshIntervalMs), ...actionDrivers(wiring, modelFor, slackClientFor) }
}

function actionDrivers(wiring: Wiring, modelFor: ModelFor, slackClientFor: SlackClientFor) {
  const { mounts, journal, enqueue, registerCtl, unregisterCtl } = wiring
  return { agents: new AgentDirectoryDriver(mounts, journal, enqueue, registerCtl, unregisterCtl, modelFor),
    slack: new SlackDirectoryDriver(mounts, journal, enqueue, registerCtl, unregisterCtl, slackClientFor) }
}

export function startAll(drivers: BackgroundDrivers) {
  drivers.refreshes.start(); drivers.streams.start(); drivers.agents.sync(); drivers.slack.sync()
}

export function closeAll(drivers: BackgroundDrivers) {
  drivers.refreshes.close(); drivers.streams.close(); drivers.agents.close(); drivers.slack.close()
}

export function syncAll(drivers: BackgroundDrivers) {
  drivers.streams.sync(); drivers.agents.sync(); drivers.slack.sync()
}
export function recoverAll(drivers: BackgroundDrivers) { return drivers.agents.recover() }
