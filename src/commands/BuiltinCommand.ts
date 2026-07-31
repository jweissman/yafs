import { CommandContext } from './CommandContext'

export abstract class BuiltinCommand {
  abstract readonly name: string
  abstract readonly synopsis: string
  abstract execute(context: CommandContext, args: string[]): string
}
