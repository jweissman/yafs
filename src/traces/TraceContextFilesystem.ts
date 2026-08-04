import { CommandContext } from '../commands/CommandContext'
import { TraceFilesystem } from './TraceService'

export function traceFilesystem(context: CommandContext): TraceFilesystem {
  return { exists: path => context.exists(path), type: path => context.type(path),
    list: path => context.list(path), read: path => context.read(path),
    mkdir: path => context.mkdir(path), write: (path, content) => context.write(path, content) }
}
