import { NodeStore } from './vfs/NodeStore';
import { User } from './types/User';
import { Shell } from './Shell';
import { ExecutionResult } from './types/ExecutionResult';
import { ExecutionPlan } from './types/ExecutionPlan';
import { BuiltinCommand } from './commands/BuiltinCommand';
import { Interpreter } from './lang/Interpreter';
import { Clock, systemClock } from './core/Clock';
import { builtinCommands } from './commands/registry';
import { MountManager } from './mounts/MountManager';
import { YafsOperationQueue } from './YafsOperationQueue';
import { YafsWorkspace } from './YafsWorkspace';
import { execute, executeAsync, executeWrite, planExecution, planExecutionAsync, planWrite } from './YafsExecution';
import { YafsCommandRuntime } from './YafsCommandRuntime';
import { BlobStore } from './protocol/BlobStore';
import { memoryBlobStore } from './protocol/MemoryBlobStore';
import { TraceService } from './traces/TraceService';

type YafsOptions = {
  store?: NodeStore, user?: User, clock?: Clock, mounts?: MountManager, blobs?: BlobStore,
  traces?: TraceService
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
  blobs: BlobStore
  traces: TraceService
  commands = new YafsCommandRuntime(this)

  constructor(options: YafsOptions = {}) {
    this.initialize(options)
  }

  private initialize(options: YafsOptions) {
    this.clock = options.clock || systemClock; this.store = options.store || new NodeStore(this.clock)
    this.initializeTraces(options); this.configure(options)
  }
  private initializeTraces(options: YafsOptions) {
    this.blobs = options.blobs || memoryBlobStore()
    this.traces = options.traces || new TraceService(this.blobs)
  }

  private configure(options: YafsOptions) {
    this.user = options.user || { name: 'root' }
    this.mounts = options.mounts || new MountManager(this.store)
    this.initializeShell(); this.initializeWorkspace(); this.initializeOperations()
  }

  private initializeWorkspace() {
    this.workspace = new YafsWorkspace(this.shell, this.store, () => this.mounts.mounts())
  }
  private initializeOperations() {
    this.operationQueue = new YafsOperationQueue(this.store, this.mounts, this.clock,
      () => this.user.name)
  }

  private initializeShell() {
    this.shell = new Shell(this.user, this.store)
    this.interpreter = new Interpreter(); this.registerBuiltins()
  }

  static exec(input: string) { return new Yafs().exec(input) }

  exec(input: string): string {
    const result = execute(this, input)
    if (result.error) throw new Error(result.error.message)
    return result.stdout
  }

  execute(input: string): ExecutionResult { return execute(this, input) }
  executeAsync(input: string): Promise<ExecutionResult> { return executeAsync(this, input) }
  executeWrite(path: string, content: string): ExecutionResult { return executeWrite(this, path, content) }

  apply(operations: import('./vfs/VfsOperation').VfsOperation[]) { this.operationQueue.apply(operations) }

  plan(input: string): ExecutionPlan { return planExecution(this, input) }
  planAsync(input: string): Promise<ExecutionPlan> { return planExecutionAsync(this, input) }
  planWrite(path: string, content: string): ExecutionPlan { return planWrite(this, path, content) }

  handle(command: import('./types/Command').Command): string { return this.commands.handle(command) }
  handleAsync(command: import('./types/Command').Command) { return this.commands.handleAsync(command) }

  requiredArg(command: string, args: string[], index: number): string {
    const value = args[index]
    if (!value) throw new Error(`${command} requires argument ${index + 1}`)
    return value
  }

  private registerBuiltins() {
    this.builtins = new Map(builtinCommands().map(command => [command.name, command]))
  }
}
