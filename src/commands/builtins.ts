import { BuiltinCommand } from './BuiltinCommand'
import { filesystemCommands } from './FilesystemCommands'
import { inspectionCommands } from './InspectionCommands'
import { sessionCommands } from './SessionCommands'

export function commands(): BuiltinCommand[] {
  return [...sessionCommands(), ...filesystemCommands(), ...inspectionCommands()]
}
