import { BuiltinCommand } from './BuiltinCommand'
import { CommandContext } from './CommandContext'

class MountsCommand {
  readonly name = 'mounts'; readonly synopsis = 'mounts'
  readonly access = 'read'

  execute(context: CommandContext, args: string[]) {
    if (args.length) throw new Error('mounts only lists VFS composition; use plugins for lifecycle')
    return context.mounts().join('\n')
  }
}

class PluginsCommand {
  readonly name = 'plugins'
  readonly synopsis = 'plugins [describe [NAME]|status|plan|apply [--prune]|refresh ID]'
  // apply/refresh mutate; access is per-command, not per-subcommand, so the whole
  // command must stay non-'read' — matching how `mount` already treats `validate`.
  readonly access = 'control'

  execute(context: CommandContext, args: string[]): string | Promise<string> {
    if (!args.length || args[0] === 'describe') return this.describe(context, args)
    return desired(context, args)
  }

  private describe(context: CommandContext, args: string[]) { return JSON.stringify(context.plugins(args[1])) }
}

class PluginLifecycleCommand {
  readonly access = 'control'

  constructor(readonly name: 'plugin' | 'mount', private readonly deactivate: 'deactivate' | 'unmount') {}

  get synopsis() { return `${this.name} validate|activate|refresh MANIFEST [ID] | ${this.deactivate} ID` }
  execute(context: CommandContext, args: string[]): string | Promise<string> {
    return lifecycle(context, args, this.name, this.deactivate)
  }
}

function desired(context: CommandContext, args: string[]) {
  if (args[0] === 'apply') return context.applyDesired(args[1] === '--prune').then(JSON.stringify)
  if (args[0] === 'refresh') return desiredRefresh(context, args[1])
  return desiredRead(context, args[0])
}

function desiredRefresh(context: CommandContext, id: string | undefined) {
  if (!id) throw new Error('plugins refresh requires an id')
  return context.refreshDesired(id).then(JSON.stringify)
}

function desiredRead(context: CommandContext, action: string) {
  if (action === 'status') return context.desiredStatus().then(JSON.stringify)
  if (action === 'plan') return context.desiredPlan().then(JSON.stringify)
  throw new Error('plugins expects describe, status, plan, apply [--prune], or refresh ID')
}

function lifecycle(context: CommandContext, args: string[], name: string, deactivate: string) {
  if (args[0] === deactivate) return deactivation(context, args[1], name, deactivate)
  if (args[0] === 'refresh') return refresh(context, args, name)
  return activation(context, args, name)
}

function activation(context: CommandContext, args: string[], name: string) {
  const record = planned(context, args[1], args[2], name)
  if (args[0] !== 'activate') return JSON.stringify(record)
  return activatePrepared(context, context.prepareMount(record))
}

function activatePrepared(context: CommandContext, prepared: import('../mounts/types').PreparedMountRecord | Promise<import('../mounts/types').PreparedMountRecord>) {
  return prepared instanceof Promise ? prepared.then(value => activate(context, value)) : activate(context, prepared)
}

function planned(context: CommandContext, manifest: string | undefined, id: string | undefined, name: string) {
  if (!manifest) throw new Error(`${name} requires a manifest path`)
  return context.planMount(context.resolve(manifest), id)
}

function activate(context: CommandContext, record: import('../mounts/types').PreparedMountRecord) {
  context.mount(record); return `${record.id} active`
}

function refresh(context: CommandContext, args: string[], name: string) {
  if (!args[1]) throw new Error(`${name} refresh requires a manifest path`)
  const prepared = context.planRefresh(context.resolve(args[1]), args[2])
  return refreshPrepared(context, prepared)
}

function refreshPrepared(context: CommandContext,
  prepared: import('../mounts/types').PreparedMountRecord | Promise<import('../mounts/types').PreparedMountRecord>) {
  if (prepared instanceof Promise) return prepared.then(record => refreshed(context, record))
  return refreshed(context, prepared)
}

function refreshed(context: CommandContext, record: import('../mounts/types').PreparedMountRecord) {
  context.refresh(record); return `${record.id} refreshed`
}

function deactivation(context: CommandContext, id: string | undefined, name: string, action: string) {
  if (!id) throw new Error(`${name} ${action} requires an id`)
  context.planUnmount(id); context.unmount(id); return deactivationResult(id, action)
}

function deactivationResult(id: string, action: string) {
  return `${id} ${action === 'unmount' ? 'unmounted' : 'deactivated'}`
}

export function pluginCommands(): BuiltinCommand[] {
  return [new MountsCommand(), new PluginsCommand(), new PluginLifecycleCommand('plugin', 'deactivate'),
    new PluginLifecycleCommand('mount', 'unmount')]
}
