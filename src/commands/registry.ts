import { AbsolutePath } from '../core/AbsolutePath';
import { VERSION } from '../core/version';
import { BuiltinCommand } from './BuiltinCommand';
import { CommandContext } from './CommandContext';

const command = (name: string, synopsis: string, execute: (args: string[]) => string): BuiltinCommand => ({ name, synopsis, execute });

export function builtinCommands(context: CommandContext): BuiltinCommand[] {
  return [...sessionCommands(context), ...filesystemCommands(context), ...inspectionCommands(context)];
}

function sessionCommands(context: CommandContext): BuiltinCommand[] {
  return [...identityCommands(context), ...shellCommands(context)];
}

function identityCommands(context: CommandContext): BuiltinCommand[] {
  return [command('help', 'help', () => context.help()), command('version', 'version', () => `yafs ${VERSION}`), command('whoami', 'whoami', () => context.user()), command('date', 'date', () => context.clock.now().toISOString())];
}

function shellCommands(context: CommandContext): BuiltinCommand[] {
  return [command('true', 'true', () => ''), command('false', 'false', () => { throw new Error('false') }), command('echo', 'echo [WORD...]', args => args.join(' ')), command('printf', 'printf [WORD...]', args => args.join('')), command('pwd', 'pwd', () => context.pwd()), command('cd', 'cd PATH', args => { context.cd(context.required('cd', args, 0)); return '' })];
}

function filesystemCommands(context: CommandContext): BuiltinCommand[] {
  return [...mutationCommands(context), ...readCommands(context)];
}

function mutationCommands(context: CommandContext): BuiltinCommand[] {
  return [command('mkdir', 'mkdir PATH', args => mutate(context.mkdir, context, 'mkdir', args)), command('touch', 'touch PATH', args => mutate(context.touch, context, 'touch', args)), command('rm', 'rm PATH', args => mutate(context.remove, context, 'rm', args)), linkCommand(context), unionCommand(context)];
}

function mutate(action: (path: AbsolutePath) => void, context: CommandContext, name: string, args: string[]): string {
  action(context.resolve(context.required(name, args, 0))); return '';
}

function linkCommand(context: CommandContext): BuiltinCommand {
  return command('ln', 'ln -s TARGET LINK', args => { if (args[0] !== '-s') throw new Error('Only symbolic links are supported; use ln -s TARGET LINK'); context.symlink(context.required('ln', args, 1), context.resolve(context.required('ln', args, 2))); return '' });
}

function unionCommand(context: CommandContext): BuiltinCommand {
  return command('union', 'union NAME LAYER...', args => { const layers = args.slice(1).map(layer => context.resolve(layer)); if (!layers.length) throw new Error('union requires at least one layer'); context.union(context.resolve(context.required('union', args, 0)), layers); return '' });
}

function readCommands(context: CommandContext): BuiltinCommand[] {
  return [command('cat', 'cat PATH', args => context.store.read(context.resolve(context.required('cat', args, 0)))), command('readlink', 'readlink PATH', args => context.store.readlink(context.resolve(context.required('readlink', args, 0)))), command('ls', 'ls [PATH]', args => context.store.list(context.resolve(args[0] || '.')).join('\n'))];
}

function inspectionCommands(context: CommandContext): BuiltinCommand[] {
  return [command('stat', 'stat PATH', args => context.store.type(context.resolve(context.required('stat', args, 0)))), command('lstat', 'lstat PATH', args => context.store.type(context.resolve(context.required('lstat', args, 0)), false)), command('origins', 'origins PATH', args => context.store.origins(context.resolve(context.required('origins', args, 0))).join('\n')), command('mounts', 'mounts', () => context.store.mounts().map(mount => `${mount.path} union ${mount.layers.join(' ')}`).join('\n')), inspectCommand(context)];
}

function inspectCommand(context: CommandContext): BuiltinCommand {
  return command('inspect', 'inspect PATH', args => { const path = context.resolve(context.required('inspect', args, 0)); return JSON.stringify({ path, type: context.store.type(path), origins: context.store.origins(path) }) });
}
