import { CommandContext } from './commands/CommandContext'
import { Clock } from './core/Clock'
import { AbsolutePath } from './core/AbsolutePath'
import { MountManager } from './mounts/MountManager'
import { YafsOperationQueue } from './YafsOperationQueue'
import { YafsWorkspace } from './YafsWorkspace'

type Dependencies = {
  clock: Clock, user: () => string, pwd: () => AbsolutePath,
  resolve: (path: string) => AbsolutePath,
  required: CommandContext['required'], help: () => string, workspace: YafsWorkspace,
  mounts: MountManager, operations: YafsOperationQueue
}

export function commandContext(dependencies: Dependencies): CommandContext {
  return { ...session(dependencies), ...filesystem(dependencies), ...mounts(dependencies),
    ...mutations(dependencies) }
}

function session({ clock, user, pwd, resolve, required, help, workspace }: Dependencies) {
  return { clock, user, pwd, resolve, required, help, cd: (path: string) => workspace.cd(path) }
}

function filesystem({ workspace }: Dependencies) {
  return { ...reads(workspace), ...inspects(workspace) }
}

function reads(workspace: YafsWorkspace) {
  return { read: (path: AbsolutePath) => workspace.read(path),
    readlink: (path: AbsolutePath) => workspace.readlink(path), list: (path: AbsolutePath) => workspace.list(path) }
}

function inspects(workspace: YafsWorkspace) {
  return { type: (path: AbsolutePath, follow?: boolean) => workspace.type(path, follow),
    origins: (path: AbsolutePath) => workspace.origins(path),
    provenance: (path: AbsolutePath) => workspace.provenance(path), mounts: () => workspace.mountLines() }
}

function mounts({ mounts: manager, operations }: Dependencies) {
  return { ...mountPlanning(manager), ...mountMutations(operations) }
}

function mountPlanning(manager: MountManager) {
  return { ...mountActivation(manager),
    planRefresh: (path: AbsolutePath, id?: string) => manager.prepareRefresh(path, id),
    planUnmount: (id: string) => manager.planUnmount(id) }
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
  return { ...simpleMutations(operations),
    symlink: (target: string, path: AbsolutePath) => operations.add({ type: 'symlink', target, path }),
    union: (path: AbsolutePath, layers: AbsolutePath[]) => union(operations, path, layers) }
}

function simpleMutations(operations: YafsOperationQueue) {
  return { ...fileMutations(operations),
    remove: (path: AbsolutePath) => operations.add({ type: 'remove', path }) }
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
