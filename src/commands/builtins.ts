import { BuiltinCommand } from './BuiltinCommand'
import { filesystemCommands } from './FilesystemCommands'
import { inspectionCommands } from './InspectionCommands'
import { sessionCommands } from './SessionCommands'
import { textCommands } from './TextCommands'

export function commands(): BuiltinCommand[] {
  return [...sessionCommands(), ...filesystemCommands(), ...textCommands(), ...inspectionCommands()]
}
