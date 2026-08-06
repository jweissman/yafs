import { CommandContext } from './commands/CommandContext'
import { Clock } from './core/Clock'
import { AbsolutePath } from './core/AbsolutePath'
import { MountManager } from './mounts/MountManager'
import { YafsOperationQueue } from './YafsOperationQueue'
import { YafsWorkspace } from './YafsWorkspace'
import { TraceService } from './traces/TraceService'
import { DesiredMounts } from './mounts/DesiredMounts'
import { CacheService } from './cache/CacheService'
import { agentPersonaPath } from './agents/AgentPersonaLookup'
import { slackPluginPath } from './mounts/SlackPluginLookup'

type Dependencies = {
  clock: Clock, user: () => string, pwd: () => AbsolutePath,
  resolve: (path: string) => AbsolutePath,
  required: CommandContext['required'], help: () => string, workspace: YafsWorkspace,
  mounts: MountManager, operations: YafsOperationQueue, traces: TraceService,
  cache: CacheService, desired?: DesiredMounts
}

export function commandContext(dependencies: Dependencies): CommandContext {
  return { ...session(dependencies), ...filesystem(dependencies), ...mounts(dependencies),
    ...mutations(dependencies), traces: dependencies.traces, cache: dependencies.cache }
}

function session({ clock, user, pwd, resolve, required, help, workspace }: Dependencies) {
  return { clock, user, pwd, resolve, required, help, cd: (path: string) => workspace.cd(path) }
}

function filesystem({ workspace }: Dependencies) {
  return { ...reads(workspace), ...inspects(workspace) }
}

function reads(workspace: YafsWorkspace) {
  return { exists: (path: AbsolutePath) => workspace.exists(path), read: (path: AbsolutePath) => workspace.read(path),
    readlink: (path: AbsolutePath) => workspace.readlink(path), list: (path: AbsolutePath) => workspace.list(path) }
}

function inspects(workspace: YafsWorkspace) {
  return { type: (path: AbsolutePath, follow?: boolean) => workspace.type(path, follow),
    origins: (path: AbsolutePath) => workspace.origins(path),
    provenance: (path: AbsolutePath) => workspace.provenance(path), mounts: () => workspace.mountLines() }
}

function mounts({ mounts: manager, operations, desired }: Dependencies) {
  return { ...mountPlanning(manager), ...mountMutations(operations), ...desiredMounts(desired, operations),
    ...pluginLookups(manager) }
}

function pluginLookups(manager: MountManager) {
  return { plugins: (name?: string) => manager.plugins(name),
    agentPersona: (reference: string) => agentPersonaPath(manager, reference),
    slackPlugin: (id: string) => slackPluginPath(manager, id) }
}

function mountPlanning(manager: MountManager) {
  return { ...mountActivation(manager), ...resourceReferences(manager),
    planRefresh: (path: AbsolutePath, id?: string) => manager.prepareRefresh(path, id),
    planUnmount: (id: string) => manager.planUnmount(id) }
}
function desiredMounts(desired: DesiredMounts | undefined, operations: YafsOperationQueue) {
  return desired ? configuredDesiredMounts(desired, operations) : missingDesiredMounts()
}
function configuredDesiredMounts(desired: DesiredMounts, operations: YafsOperationQueue) {
  const mutations = mountMutations(operations); const applyDesired = (prune = false) => desired.apply(mutations, prune)
  return { desiredStatus: () => desired.status(), desiredPlan: () => desired.plan(), applyDesired,
    refreshDesired: (id: string) => desired.refreshOne(id, mutations) }
}
function missingDesiredMounts() {
  const missing = () => Promise.reject(new Error('No daemon mount configuration'))
  return { desiredStatus: () => Promise.resolve({ configured: false }), desiredPlan: () => Promise.resolve([]),
    applyDesired: missing, refreshDesired: missing }
}
function resourceReferences(manager: MountManager) {
  return { resourceReference: (path: AbsolutePath) => manager.resourceReference(path) }
}

function mountActivation(manager: MountManager) {
  return { planMount: (path: AbsolutePath, id?: string) => manager.planActivation(path, id),
    prepareMount: record => manager.prepareActivation(record) }
}

function mountMutations(operations: YafsOperationQueue) {
  return { mount: record => operations.add({ type: 'mount', record }),
    refresh: record => operations.add({ type: 'refresh', record }),
    unmount: (id: string) => operations.add({ type: 'unmount', id }) }
}

function mutations({ operations }: Dependencies) {
  return { ...simpleMutations(operations), ...afterCommit(operations),
    symlink: (target: string, path: AbsolutePath) => operations.add({ type: 'symlink', target, path }),
    union: (path: AbsolutePath, layers: AbsolutePath[]) => union(operations, path, layers) }
}
function afterCommit(operations: YafsOperationQueue) {
  return { afterCommit: (effect: () => void) => operations.afterCommit(effect) }
}

function simpleMutations(operations: YafsOperationQueue) {
  return { ...fileMutations(operations),
    remove: (path: AbsolutePath) => operations.add({ type: 'remove', path }),
    rmdir: (path: AbsolutePath) => operations.add({ type: 'rmdir', path }) }
}

function fileMutations(operations: YafsOperationQueue) {
  return { mkdir: (path: AbsolutePath) => operations.add({ type: 'mkdir', path }),
    touch: (path: AbsolutePath) => operations.add({ type: 'touch', path }),
    write: (path: AbsolutePath, content: string) => operations.add({ type: 'write', path, content }) }
}

function union(operations: YafsOperationQueue, path: AbsolutePath, layers: AbsolutePath[]) {
  if (!layers.length) throw new Error('union requires at least one layer')
  operations.add({ type: 'union', path, layers })
}
