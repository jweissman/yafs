import type { CommandContext } from './CommandContext'

export interface BuiltinCommand {
  readonly name: string
  readonly synopsis: string
  execute(context: CommandContext, args: string[]): string
}
