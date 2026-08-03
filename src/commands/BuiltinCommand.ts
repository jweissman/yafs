import type { CommandContext } from './CommandContext'

export type CommandAccess = 'read' | 'session' | 'mutate' | 'control'

export interface BuiltinCommand {
  readonly name: string
  readonly synopsis: string
  readonly access: CommandAccess
  execute(context: CommandContext, args: string[]): string | Promise<string>
}
