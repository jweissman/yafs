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

class InspectCommand {
  readonly name = 'inspect'; readonly synopsis = 'inspect PATH'
  readonly access = 'read'
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name)
    return JSON.stringify({ path, type: context.type(path), origins: context.provenance(path) })
  }
}

export function inspectionCommands(): BuiltinCommand[] {
  return [statCommand(), lstatCommand(), originsCommand(), inspectCommand()]
}

function statCommand() { return new StatCommand() }
function lstatCommand() { return new LstatCommand() }
function originsCommand() { return new OriginsCommand() }
function inspectCommand() { return new InspectCommand() }
