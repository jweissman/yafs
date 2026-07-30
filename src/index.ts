import { NodeStore } from './vfs/NodeStore';
import { User } from './types/User';
import { AbsolutePath } from './core/AbsolutePath';
import { Shell } from './Shell';
import { Command } from './types/Command';
import { Mutation } from './types/Mutation';
import { ExecutionResult } from './types/ExecutionResult';
import { BuiltinCommand } from './commands/BuiltinCommand';
import { Interpreter } from './lang/Interpreter';
import { Clock, systemClock } from './core/Clock';
import { errorCode } from './core/errors';
import { evaluateWord } from './lang/evaluate';
import { CommandContext } from './commands/CommandContext';
import { builtinCommands } from './commands/registry';

export default class Yafs {
  store: NodeStore
  user: User
  shell: Shell
  interpreter: Interpreter
  private mutations: Mutation[] = []
  private builtins = new Map<string, BuiltinCommand>()

  private clock: Clock

  constructor(options: { store?: NodeStore, user?: User, clock?: Clock } = {}) {
    this.clock = options.clock || systemClock
    this.store = options.store || new NodeStore(this.clock)
    this.user = options.user || { name: 'root' }
    this.shell = new Shell(this.user, this.store)
    this.interpreter = new Interpreter(this.shell)
    this.registerBuiltins()
  }

  static exec(input: string) {
    const yafs = new Yafs()
    return yafs.exec(input)
  }

  exec(input: string): string {
    const result = this.execute(input)
    if (result.error) throw new Error(result.error.message)
    return result.stdout
  }

  execute(input: string): ExecutionResult {
    try {
      return this.success(this.handle(this.interpreter.parse(input)))
    } catch (error) {
      return this.failure(error)
    }
  }

  private success(stdout: string): ExecutionResult { return { stdout, stderr: '', status: 0, session: this.sessionState() } }

  private failure(error: unknown): ExecutionResult {
    const message = error instanceof Error ? error.message : String(error)
    return { stdout: '', stderr: message, status: message.startsWith('Unknown command:') ? 127 : 1, error: { code: errorCode(message), message }, session: this.sessionState() }
  }

  drainMutations(): Mutation[] {
    const mutations = this.mutations
    this.mutations = []
    return mutations
  }

  private handle(command: Command): string {
    const args = command.args.map(word => evaluateWord(word, name => this.variable(name)))
    const output = this.runCommand(command.name, args)
    return command.redirect ? this.redirect(command.redirect.target, output) : output
  }

  private redirect(target: string, output: string): string {
    this.write(this.shell.resolve(target), output)
    return ''
  }

  private runCommand(name: string, args: string[]): string {
    const command = this.builtins.get(name)
    if (!command) throw new Error(`Unknown command: ${name}`)
    return command.execute(args)
  }

  private requiredArg(command: string, args: string[], index: number): string {
    const value = args[index]
    if (!value) throw new Error(`${command} requires argument ${index + 1}`)
    return value
  }

  private registerBuiltins() {
    this.builtins = new Map(builtinCommands(this.commandContext()).map(command => [command.name, command]))
  }

  private commandContext(): CommandContext {
    return { clock: this.clock, store: this.store, user: () => this.user.name, pwd: () => this.shell.pwd, cd: path => this.shell.cd(path), resolve: path => this.shell.resolve(path), required: (command, args, index) => this.requiredArg(command, args, index), help: () => [...this.builtins.values()].map(command => command.synopsis).sort().join('\n'), mkdir: path => this.mkdir(path), touch: path => this.touch(path), remove: path => this.remove(path), symlink: (target, path) => this.symlink(target, path), union: (path, layers) => this.union(path, layers) }
  }

  private mkdir(path: AbsolutePath) {
    this.store.mkdir(path)
    this.mutations.push({ type: 'mkdir', path })
  }

  private touch(path: AbsolutePath) {
    this.store.touch(path)
    this.mutations.push({ type: 'touch', path })
  }

  private write(path: AbsolutePath, content: string) {
    this.store.write(path, content)
    this.mutations.push({ type: 'write', path, content })
  }

  private symlink(target: string, path: AbsolutePath) {
    this.store.symlink(target, path)
    this.mutations.push({ type: 'symlink', path, target })
  }

  private union(path: AbsolutePath, layers: AbsolutePath[]) {
    if (!layers.length) throw new Error('union requires at least one layer')
    this.store.union(path, layers)
    this.mutations.push({ type: 'union', path, layers })
  }

  private remove(path: AbsolutePath) {
    this.store.remove(path)
    this.mutations.push({ type: 'remove', path })
  }

  private sessionState() {
    return { user: this.user.name, cwd: this.shell.pwd }
  }

  private variable(name: string): string {
    if (name === 'USER') return this.user.name
    if (name === 'PWD') return this.shell.pwd
    return ''
  }
}
