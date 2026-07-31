import { NodeStore } from './vfs/NodeStore';
import { User } from './types/User';
import { AbsolutePath } from './core/AbsolutePath';
import { Shell } from './Shell';
import { Command } from './types/Command';
import { VfsIntent, VfsOperation } from './vfs/VfsOperation';
import { ExecutionResult } from './types/ExecutionResult';
import { ExecutionPlan } from './types/ExecutionPlan';
import { BuiltinCommand } from './commands/BuiltinCommand';
import { Interpreter } from './lang/Interpreter';
import { Clock, systemClock } from './core/Clock';
import { errorCode } from './core/errors';
import { evaluateWord } from './lang/evaluate';
import { CommandContext } from './commands/CommandContext';
import { builtinCommands } from './commands/registry';
import { MountManager } from './mounts/MountManager';
import { MountRecord, Provenance } from './mounts/types';

type YafsOptions = {
  store?: NodeStore, user?: User, clock?: Clock, mounts?: MountManager
}

export default class Yafs {
  store: NodeStore
  user: User
  shell: Shell
  interpreter: Interpreter
  mounts: MountManager
  private operations: VfsOperation[] = []
  private builtins = new Map<string, BuiltinCommand>()

  private clock: Clock

  constructor(options: YafsOptions = {}) {
    this.clock = options.clock || systemClock
    this.store = options.store || new NodeStore(this.clock)
    this.configure(options)
  }

  private configure(options: YafsOptions) {
    this.user = options.user || { name: 'root' }
    this.mounts = options.mounts || new MountManager(this.store)
    this.initializeShell()
  }

  private initializeShell() {
    this.shell = new Shell(this.user, this.store)
    this.interpreter = new Interpreter(this.shell); this.registerBuiltins()
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
    const plan = this.plan(input)
    if (!plan.result.error) this.apply(plan.operations)
    return plan.result
  }

  plan(input: string): ExecutionPlan {
    this.operations = []
    try { return this.planned(input) }
    catch (error) { return { result: this.failure(error), operations: [] } }
  }

  private planned(input: string): ExecutionPlan {
    const result = this.success(this.handle(this.interpreter.parse(input)))
    this.store.validate(this.operations)
    return { result, operations: this.operations }
  }

  private success(stdout: string): ExecutionResult { return { stdout, stderr: '', status: 0, session: this.sessionState() } }

  private failure(error: unknown): ExecutionResult {
    const message = error instanceof Error ? error.message : String(error)
    return { stdout: '', stderr: message, status: message.startsWith('Unknown command:') ? 127 : 1, error: { code: errorCode(message), message }, session: this.sessionState() }
  }

  apply(operations: VfsOperation[]) {
    this.store.validate(operations)
    operations.forEach(operation => this.applyOperation(operation))
  }

  private applyOperation(operation: VfsOperation) {
    if (operation.type === 'mount') return this.mounts.activate(operation.record, this.user.name)
    if (operation.type === 'unmount') return this.mounts.unmount(operation.id, this.user.name)
    this.store.apply(operation)
  }

  private handle(command: Command): string {
    const args = this.arguments(command)
    const output = this.runCommand(command.name, args)
    return command.redirect ? this.redirect(command.redirect.target, output) : output
  }

  private arguments(command: Command) {
    return command.args.map(word =>
      evaluateWord(word, name => this.variable(name), nested => this.substitute(nested)))
  }

  private redirect(target: string, output: string): string {
    this.write(this.shell.resolve(target), output)
    return ''
  }

  private substitute(command: Command): string {
    const state = this.substitutionState()
    try { return this.handle(command).replace(/\n+$/, '') }
    finally { this.restoreSubstitution(state) }
  }

  private substitutionState() {
    return { cwd: this.shell.pwd, operationCount: this.operations.length }
  }

  private restoreSubstitution(state: { cwd: AbsolutePath, operationCount: number }) {
    this.shell.enter(state.cwd); this.operations.length = state.operationCount
  }

  private runCommand(name: string, args: string[]): string {
    const command = this.builtins.get(name)
    if (!command) throw new Error(`Unknown command: ${name}`)
    return command.execute(this.commandContext(), args)
  }

  private requiredArg(command: string, args: string[], index: number): string {
    const value = args[index]
    if (!value) throw new Error(`${command} requires argument ${index + 1}`)
    return value
  }

  private registerBuiltins() {
    this.builtins = new Map(builtinCommands().map(command => [command.name, command]))
  }

  private commandContext(): CommandContext {
    return { clock: this.clock, user: () => this.user.name, pwd: () => this.shell.pwd, cd: path => this.cd(path), resolve: path => this.shell.resolve(path), required: (command, args, index) => this.requiredArg(command, args, index), help: () => [...this.builtins.values()].map(command => command.synopsis).sort().join('\n'), read: path => this.read(path), readlink: path => this.readlink(path), list: path => this.list(path), type: (path, follow) => this.type(path, follow), origins: path => this.origins(path), provenance: path => this.provenance(path), mounts: () => this.mountLines(), planMount: (path, id) => this.mounts.planActivation(path, id), planUnmount: id => this.mounts.planUnmount(id), mkdir: path => this.mkdir(path), touch: path => this.touch(path), remove: path => this.remove(path), symlink: (target, path) => this.symlink(target, path), union: (path, layers) => this.union(path, layers), mount: record => this.mount(record), unmount: id => this.unmount(id) }
  }

  private cd(path: string) {
    const absolute = this.shell.resolve(path)
    if (this.type(absolute) !== 'directory') throw new Error(`No such directory: ${absolute}`)
    this.shell.enter(absolute)
  }

  private read(path: AbsolutePath) { return this.mounts.read(path) ?? this.store.read(path) }

  private readlink(path: AbsolutePath) {
    if (this.mounts.type(path)) throw new Error(`Not a symbolic link: ${path}`)
    return this.store.readlink(path)
  }

  private list(path: AbsolutePath) {
    if (this.mounts.type(path)) return this.mounts.list(path, [])
    return this.mounts.list(path, this.store.list(path))
  }

  private type(path: AbsolutePath, follow = true): 'file' | 'directory' | 'symlink' {
    return this.mounts.type(path) || this.store.type(path, follow)
  }

  private origins(path: AbsolutePath) { return this.provenance(path).map(origin => origin.path) }

  private provenance(path: AbsolutePath): Provenance[] {
    return this.mounts.provenance(path)
      || this.store.origins(path).map(origin => ({ kind: 'local', path: origin }))
  }

  private mountLines() {
    return [...this.unionMountLines(), ...this.providerMountLines()]
  }

  private unionMountLines() { return this.store.mounts().map(this.renderUnionMount) }

  private renderUnionMount(mount: { path: string, layers: string[] }) {
    return `${mount.path} union ${mount.layers.join(' ')}`
  }

  private providerMountLines() { return this.mounts.mounts().map(this.renderProviderMount) }

  private renderProviderMount(mount: MountRecord) { return `${mount.path} ${mount.provider} ${mount.state}` }

  private mkdir(path: AbsolutePath) {
    this.operation({ type: 'mkdir', path })
  }

  private touch(path: AbsolutePath) {
    this.operation({ type: 'touch', path })
  }

  private write(path: AbsolutePath, content: string) {
    this.operation({ type: 'write', path, content })
  }

  private symlink(target: string, path: AbsolutePath) {
    this.operation({ type: 'symlink', path, target })
  }

  private union(path: AbsolutePath, layers: AbsolutePath[]) {
    if (!layers.length) throw new Error('union requires at least one layer')
    this.operation({ type: 'union', path, layers })
  }

  private remove(path: AbsolutePath) {
    this.operation({ type: 'remove', path })
  }

  private operation(operation: VfsIntent) {
    if ('path' in operation) this.mounts.assertWritable(operation.path)
    this.operations.push({ ...operation, at: this.clock.now().toISOString() } as VfsOperation)
  }

  private mount(record: MountRecord) { this.operation({ type: 'mount', record } as VfsIntent) }

  private unmount(id: string) { this.operation({ type: 'unmount', id } as VfsIntent) }

  private sessionState() {
    return { user: this.user.name, cwd: this.shell.pwd }
  }

  private variable(name: string): string {
    if (name === 'USER') return this.user.name
    if (name === 'PWD') return this.shell.pwd
    return ''
  }
}
