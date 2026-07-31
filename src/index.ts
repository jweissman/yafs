import { NodeStore } from './vfs/NodeStore';
import { User } from './types/User';
import { AbsolutePath } from './core/AbsolutePath';
import { Shell } from './Shell';
import { Command } from './types/Command';
import { ExecutionResult } from './types/ExecutionResult';
import { ExecutionPlan } from './types/ExecutionPlan';
import { BuiltinCommand } from './commands/BuiltinCommand';
import { Interpreter } from './lang/Interpreter';
import { Clock, systemClock } from './core/Clock';
import { evaluateWord } from './lang/evaluate';
import { builtinCommands } from './commands/registry';
import { MountManager } from './mounts/MountManager';
import { YafsOperationQueue } from './YafsOperationQueue';
import { YafsWorkspace } from './YafsWorkspace';
import { execute, planExecution } from './YafsExecution';
import { yafsContext } from './YafsContext';
import { variable } from './YafsValues';

type YafsOptions = {
  store?: NodeStore, user?: User, clock?: Clock, mounts?: MountManager
}

export default class Yafs {
  store: NodeStore
  user: User
  shell: Shell
  interpreter: Interpreter
  mounts: MountManager
  builtins = new Map<string, BuiltinCommand>()
  workspace: YafsWorkspace
  operationQueue: YafsOperationQueue
  clock: Clock

  constructor(options: YafsOptions = {}) {
    this.clock = options.clock || systemClock
    this.store = options.store || new NodeStore(this.clock)
    this.configure(options)
  }

  private configure(options: YafsOptions) {
    this.user = options.user || { name: 'root' }
    this.mounts = options.mounts || new MountManager(this.store)
    this.initializeShell(); this.initializeWorkspace(); this.initializeOperations()
  }

  private initializeWorkspace() {
    this.workspace = new YafsWorkspace(this.shell, this.store, this.mounts)
  }
  private initializeOperations() {
    this.operationQueue = new YafsOperationQueue(this.store, this.mounts, this.clock,
      () => this.user.name)
  }

  private initializeShell() {
    this.shell = new Shell(this.user, this.store)
    this.interpreter = new Interpreter(this.shell); this.registerBuiltins()
  }

  static exec(input: string) { return new Yafs().exec(input) }

  exec(input: string): string {
    const result = execute(this, input)
    if (result.error) throw new Error(result.error.message)
    return result.stdout
  }

  execute(input: string): ExecutionResult { return execute(this, input) }

  apply(operations: import('./vfs/VfsOperation').VfsOperation[]) { this.operationQueue.apply(operations) }

  plan(input: string): ExecutionPlan { return planExecution(this, input) }

  handle(command: Command): string {
    const args = this.arguments(command)
    const output = this.runCommand(command.name, args)
    return command.redirect ? this.redirect(command.redirect.target, output) : output
  }

  private arguments(command: Command) {
    return command.args.map(word =>
      evaluateWord(word, name => variable(this, name), nested => this.substitute(nested)))
  }

  private redirect(target: string, output: string): string {
    this.operationQueue.add({ type: 'write', path: this.shell.resolve(target), content: output })
    return ''
  }

  private substitute(command: Command): string {
    const state = this.substitutionState()
    try { return this.handle(command).replace(/\n+$/, '') }
    finally { this.restoreSubstitution(state) }
  }

  private substitutionState() {
    return { cwd: this.shell.pwd, operationCount: this.operationQueue.count() }
  }

  private restoreSubstitution(state: { cwd: AbsolutePath, operationCount: number }) {
    this.shell.enter(state.cwd); this.operationQueue.restore(state.operationCount)
  }

  private runCommand(name: string, args: string[]): string {
    const command = this.builtins.get(name)
    if (!command) throw new Error(`Unknown command: ${name}`)
    return command.execute(this.context(), args)
  }

  requiredArg(command: string, args: string[], index: number): string {
    const value = args[index]
    if (!value) throw new Error(`${command} requires argument ${index + 1}`)
    return value
  }

  private registerBuiltins() {
    this.builtins = new Map(builtinCommands().map(command => [command.name, command]))
  }

  private context() { return yafsContext(this) }
}
