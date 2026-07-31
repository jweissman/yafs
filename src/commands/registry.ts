import { BuiltinCommand } from './BuiltinCommand'
import { commands } from './builtins'

export function builtinCommands(): BuiltinCommand[] { return commands() }
