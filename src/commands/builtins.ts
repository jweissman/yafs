import { AbsolutePath } from '../core/AbsolutePath'
import { VERSION } from '../core/version'
import { BuiltinCommand } from './BuiltinCommand'
import { CommandContext } from './CommandContext'

abstract class Command extends BuiltinCommand {
  protected path(context: CommandContext, args: string[]) {
    return context.resolve(context.required(this.name, args, 0))
  }
}

export class HelpCommand extends Command {
  readonly name = 'help'; readonly synopsis = 'help'
  execute(context: CommandContext): string { return context.help() }
}

export class VersionCommand extends Command {
  readonly name = 'version'; readonly synopsis = 'version'
  execute(): string { return `yafs ${VERSION}` }
}

export class WhoamiCommand extends Command {
  readonly name = 'whoami'; readonly synopsis = 'whoami'
  execute(context: CommandContext): string { return context.user() }
}

export class DateCommand extends Command {
  readonly name = 'date'; readonly synopsis = 'date'
  execute(context: CommandContext): string { return context.clock.now().toISOString() }
}

export class TrueCommand extends Command {
  readonly name = 'true'; readonly synopsis = 'true'
  execute(): string { return '' }
}

export class FalseCommand extends Command {
  readonly name = 'false'; readonly synopsis = 'false'
  execute(): string { throw new Error('false') }
}

export class EchoCommand extends Command {
  readonly name = 'echo'; readonly synopsis = 'echo [WORD...]'
  execute(_context: CommandContext, args: string[]): string { return args.join(' ') }
}

export class PrintfCommand extends Command {
  readonly name = 'printf'; readonly synopsis = 'printf [WORD...]'
  execute(_context: CommandContext, args: string[]): string { return args.join('') }
}

export class PwdCommand extends Command {
  readonly name = 'pwd'; readonly synopsis = 'pwd'
  execute(context: CommandContext): string { return context.pwd() }
}

export class CdCommand extends Command {
  readonly name = 'cd'; readonly synopsis = 'cd PATH'
  execute(context: CommandContext, args: string[]): string { context.cd(context.required(this.name, args, 0)); return '' }
}

abstract class MutationCommand extends Command {
  abstract mutate(context: CommandContext, path: AbsolutePath): void
  execute(context: CommandContext, args: string[]): string { this.mutate(context, this.path(context, args)); return '' }
}

export class MkdirCommand extends MutationCommand {
  readonly name = 'mkdir'; readonly synopsis = 'mkdir PATH'
  mutate(context: CommandContext, path: AbsolutePath) { context.mkdir(path) }
}

export class TouchCommand extends MutationCommand {
  readonly name = 'touch'; readonly synopsis = 'touch PATH'
  mutate(context: CommandContext, path: AbsolutePath) { context.touch(path) }
}

export class RmCommand extends MutationCommand {
  readonly name = 'rm'; readonly synopsis = 'rm PATH'
  mutate(context: CommandContext, path: AbsolutePath) { context.remove(path) }
}

export class LnCommand extends Command {
  readonly name = 'ln'; readonly synopsis = 'ln -s TARGET LINK'
  execute(context: CommandContext, args: string[]): string {
    if (args[0] !== '-s') throw new Error('Only symbolic links are supported; use ln -s TARGET LINK')
    context.symlink(context.required(this.name, args, 1), context.resolve(context.required(this.name, args, 2))); return ''
  }
}

export class UnionCommand extends Command {
  readonly name = 'union'; readonly synopsis = 'union NAME LAYER...'
  execute(context: CommandContext, args: string[]): string {
    const layers = args.slice(1).map(layer => context.resolve(layer)); if (!layers.length) throw new Error('union requires at least one layer')
    context.union(context.resolve(context.required(this.name, args, 0)), layers); return ''
  }
}

export class CatCommand extends Command {
  readonly name = 'cat'; readonly synopsis = 'cat PATH'
  execute(context: CommandContext, args: string[]): string {
    return context.read(this.path(context, args))
  }
}

export class ReadlinkCommand extends Command {
  readonly name = 'readlink'; readonly synopsis = 'readlink PATH'
  execute(context: CommandContext, args: string[]): string {
    return context.readlink(this.path(context, args))
  }
}

export class LsCommand extends Command {
  readonly name = 'ls'; readonly synopsis = 'ls [PATH]'
  execute(context: CommandContext, args: string[]): string {
    return context.list(context.resolve(args[0] || '.')).join('\n')
  }
}

export class StatCommand extends Command {
  readonly name = 'stat'; readonly synopsis = 'stat PATH'
  execute(context: CommandContext, args: string[]): string {
    return context.type(this.path(context, args))
  }
}

export class LstatCommand extends Command {
  readonly name = 'lstat'; readonly synopsis = 'lstat PATH'
  execute(context: CommandContext, args: string[]): string {
    return context.type(this.path(context, args), false)
  }
}

export class OriginsCommand extends Command {
  readonly name = 'origins'; readonly synopsis = 'origins PATH'
  execute(context: CommandContext, args: string[]): string {
    return context.origins(this.path(context, args)).join('\n')
  }
}

export class MountsCommand extends Command {
  readonly name = 'mounts'; readonly synopsis = 'mounts'
  execute(context: CommandContext): string { return context.mounts().join('\n') }
}

export class InspectCommand extends Command {
  readonly name = 'inspect'; readonly synopsis = 'inspect PATH'
  execute(context: CommandContext, args: string[]): string {
    const path = this.path(context, args)
    return JSON.stringify({ path, type: context.type(path), origins: context.provenance(path) })
  }
}

export class MountCommand extends Command {
  readonly name = 'mount'; readonly synopsis = 'mount validate|activate MANIFEST [ID] | unmount ID'
  execute(context: CommandContext, args: string[]): string {
    const [action, manifest, id] = args; if (action === 'unmount') return this.unmount(context, manifest)
    const record = this.activation(context, manifest, id); if (action !== 'activate') return JSON.stringify(record)
    context.mount(record); return `${record.id} active`
  }

  private activation(context: CommandContext, manifest: string | undefined,
    id: string | undefined) {
    if (!manifest) throw new Error('mount requires a manifest path'); return context.planMount(context.resolve(manifest), id)
  }

  private unmount(context: CommandContext, id: string | undefined) {
    if (!id) throw new Error('mount unmount requires an id'); context.planUnmount(id); context.unmount(id); return `${id} unmounted`
  }
}

export function commands(): BuiltinCommand[] {
  return [...sessionCommands(), ...filesystemCommands(), ...inspectionCommands()]
}

function sessionCommands(): BuiltinCommand[] {
  return [new HelpCommand(), new VersionCommand(), new WhoamiCommand(), new DateCommand(),
    new TrueCommand(), new FalseCommand(), new EchoCommand(), new PrintfCommand(),
    new PwdCommand(), new CdCommand()]
}

function filesystemCommands(): BuiltinCommand[] {
  return [new MkdirCommand(), new TouchCommand(), new RmCommand(), new LnCommand(),
    new UnionCommand(),
    new CatCommand(), new ReadlinkCommand(), new LsCommand()]
}

function inspectionCommands(): BuiltinCommand[] {
  return [new StatCommand(), new LstatCommand(), new OriginsCommand(), new MountsCommand(),
    new InspectCommand(), new MountCommand()]
}
