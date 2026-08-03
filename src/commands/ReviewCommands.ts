import { BuiltinCommand } from './BuiltinCommand'
import { CommandContext } from './CommandContext'

export function reviewCommands(): BuiltinCommand[] { return [reviewBindCommand()] }

function reviewBindCommand(): BuiltinCommand {
  return { name: 'review', synopsis: 'review bind SOURCE ARTIFACT_DIRECTORY', access: 'mutate',
    execute: (context, args) => bind(context, args) }
}

function bind(context: CommandContext, args: string[]) {
  if (args[0] !== 'bind') throw new Error('review requires bind SOURCE ARTIFACT_DIRECTORY')
  const source = context.resolve(context.required('review', args, 1)); const artifact = context.resolve(context.required('review', args, 2))
  return writeBinding(context, source, artifact, providerOrigin(context, source))
}

function writeBinding(context: CommandContext, source: string, artifact: import('../core/AbsolutePath').AbsolutePath,
  origin: import('../mounts/types').Provenance) {
  context.mkdir(artifact); context.write(destination(artifact), binding(source, origin)); return ''
}

function providerOrigin(context: CommandContext, source: import('../core/AbsolutePath').AbsolutePath) {
  const origin = context.provenance(source).find(item => item.kind === 'provider')
  if (!origin) throw new Error(`Review source is not provider-backed: ${source}`)
  return origin
}

function destination(artifact: import('../core/AbsolutePath').AbsolutePath) {
  return `${artifact}/source.json` as import('../core/AbsolutePath').AbsolutePath
}

function binding(sourcePath: string, origin: import('../mounts/types').Provenance) {
  return JSON.stringify({ sourcePath, mountId: origin.mountId, provider: origin.provider,
    revision: origin.revision, fetchedAt: origin.fetchedAt, boundAt: new Date().toISOString() })
}
