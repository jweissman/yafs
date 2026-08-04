import { BuiltinCommand } from './BuiltinCommand'
import { filesystemCommands } from './FilesystemCommands'
import { inspectionCommands } from './InspectionCommands'
import { sessionCommands } from './SessionCommands'
import { textCommands } from './TextCommands'
import { traceCommands } from './TraceCommands'

export function commands(): BuiltinCommand[] {
  return [...sessionCommands(), ...filesystemCommands(), ...textCommands(), ...inspectionCommands(),
    ...traceCommands()]
}
