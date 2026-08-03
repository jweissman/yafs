import { BuiltinCommand } from './BuiltinCommand'
import { commandPath } from './commandPath'
import { CommandContext } from './CommandContext'

class StatCommand {
  readonly name = 'stat'; readonly synopsis = 'stat PATH'
  readonly access = 'read'
  execute(context: CommandContext, args: string[]) { return context.type(commandPath(context, args, this.name)) }
}

class LstatCommand {
  readonly name = 'lstat'; readonly synopsis = 'lstat PATH'
  readonly access = 'read'
  execute(context: CommandContext, args: string[]) {
    return context.type(commandPath(context, args, this.name), false)
  }
}

class OriginsCommand {
  readonly name = 'origins'; readonly synopsis = 'origins PATH'
  readonly access = 'read'
  execute(context: CommandContext, args: string[]) { return context.origins(commandPath(context, args, this.name)).join('\n') }
}

class MountsCommand {
  readonly name = 'mounts'; readonly synopsis = 'mounts'
  readonly access = 'read'
  execute(context: CommandContext) { return context.mounts().join('\n') }
}

class InspectCommand {
  readonly name = 'inspect'; readonly synopsis = 'inspect PATH'
  readonly access = 'read'
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name)
    return JSON.stringify({ path, type: context.type(path), origins: context.provenance(path) })
  }
}

class MountCommand {
  readonly name = 'mount'
  readonly access = 'control'
  readonly synopsis = 'mount validate|activate|refresh MANIFEST [ID] | unmount ID'
  execute(context: CommandContext, args: string[]): string | Promise<string> {
    if (args[0] === 'unmount') return this.unmount(context, args[1])
    if (args[0] === 'refresh') return this.refresh(context, args)
    return this.activate(context, args)
  }

  private activate(context: CommandContext, args: string[]) {
    const record = this.activation(context, args[1], args[2])
    if (args[0] !== 'activate') return JSON.stringify(record)
    return this.activateRecord(context, record)
  }

  private activateRecord(context: CommandContext, record: import('../mounts/types').MountRecord) {
    const prepared = context.prepareMount(record)
    if (prepared instanceof Promise) return prepared.then(value => this.mount(context, value))
    return this.mount(context, prepared)
  }
  private mount(context: CommandContext, record: import('../mounts/types').PreparedMountRecord) {
    context.mount(record); return `${record.id} active`
  }

  private refresh(context: CommandContext, args: string[]) {
    const manifest = args[1]; if (!manifest) throw new Error('mount refresh requires a manifest path')
    const prepared = context.planRefresh(context.resolve(manifest), args[2])
    return this.applyRefresh(context, prepared)
  }

  private applyRefresh(context: CommandContext, prepared: import('../mounts/types').PreparedMountRecord | Promise<import('../mounts/types').PreparedMountRecord>) {
    return prepared instanceof Promise ? prepared.then(record => this.refreshRecord(context, record))
      : this.refreshRecord(context, prepared)
  }

  private refreshRecord(context: CommandContext, record: import('../mounts/types').PreparedMountRecord) {
    context.refresh(record); return `${record.id} refreshed`
  }

  private activation(context: CommandContext, manifest: string | undefined,
    id: string | undefined) {
    if (!manifest) throw new Error('mount requires a manifest path')
    return context.planMount(context.resolve(manifest), id)
  }

  private unmount(context: CommandContext, id: string | undefined) {
    if (!id) throw new Error('mount unmount requires an id')
    context.planUnmount(id); context.unmount(id); return `${id} unmounted`
  }
}

export function inspectionCommands(): BuiltinCommand[] {
  return [new StatCommand(), new LstatCommand(), new OriginsCommand(), new MountsCommand(),
    new InspectCommand(), new MountCommand()]
}
