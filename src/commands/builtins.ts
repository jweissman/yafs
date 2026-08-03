import { BuiltinCommand } from './BuiltinCommand'
import { filesystemCommands } from './FilesystemCommands'
import { inspectionCommands } from './InspectionCommands'
import { sessionCommands } from './SessionCommands'
import { textCommands } from './TextCommands'
import { reviewCommands } from './ReviewCommands'

export function commands(): BuiltinCommand[] {
  return [...sessionCommands(), ...filesystemCommands(), ...textCommands(), ...inspectionCommands(),
    ...reviewCommands()]
}
