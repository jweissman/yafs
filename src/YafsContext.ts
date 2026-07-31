import type Yafs from './index'
import { commandContext } from './YafsCommandContext'

export function yafsContext(yafs: Yafs) {
  return commandContext({ ...session(yafs), workspace: yafs.workspace, mounts: yafs.mounts,
    operations: yafs.operationQueue })
}

function session(yafs: Yafs) {
  return { clock: yafs.clock, user: () => yafs.user.name, pwd: () => yafs.shell.pwd,
    resolve: (path: string) => yafs.shell.resolve(path), required: yafs.requiredArg.bind(yafs),
    help: () => [...yafs.builtins.values()].map(command => command.synopsis).sort().join('\n') }
}
