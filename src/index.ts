import { NodeStore } from "./vfs/NodeStore";
import { User } from "./types/User";
import { Shell } from "./Shell";
import { ExecutionResult } from "./types/ExecutionResult";
import { ExecutionPlan } from "./types/ExecutionPlan";
import { BuiltinCommand } from "./commands/BuiltinCommand";
import { Interpreter } from "./lang/Interpreter";
import { Clock } from "./core/Clock";
import { MountManager } from "./mounts/MountManager";
import { YafsOperationQueue } from "./YafsOperationQueue";
import { YafsWorkspace } from "./YafsWorkspace";
import {
  execute,
  executeAsync,
  executeWrite,
  planCache,
  planExecution,
  planExecutionAsync,
} from "./YafsExecution";
import { planWrite } from "./YafsExecutionWrite";
import { planOperation, planOperationAsync } from "./YafsOperationPlan";
import { YafsCommandRuntime } from "./YafsCommandRuntime";
import { BlobStore } from "./protocol/BlobStore";
import { TraceService } from "./traces/TraceService";
import { DesiredMounts } from "./mounts/DesiredMounts";
import { CacheService } from "./cache/CacheService";
import { initializeYafs } from "./YafsInitialization";
import { WorkspaceOperations } from "./operations/WorkspaceOperations";
import { WorkspaceOperation } from "./operations/WorkspaceOperation";
import { yafsContext } from "./YafsContext";
import { VfsOperation } from "./vfs/VfsOperation";
import { CacheRequest } from "./cache/CacheRequest";
import { YafsOptions } from "./YafsOptionsType";

export type { YafsOptions } from "./YafsOptionsType";

export default class Yafs {
  store: NodeStore;
  user: User;
  shell: Shell;
  interpreter: Interpreter;
  mounts: MountManager;
  builtins = new Map<string, BuiltinCommand>();
  workspace: YafsWorkspace;
  operationQueue: YafsOperationQueue;
  clock: Clock;
  blobs: BlobStore;
  traces: TraceService;
  cache: CacheService;
  desired?: DesiredMounts;
  commands = new YafsCommandRuntime(this);
  operations = new WorkspaceOperations(() => yafsContext(this));

  constructor(options: YafsOptions = {}) {
    initializeYafs(this, options);
  }

  static exec(input: string) {
    return new Yafs().exec(input);
  }

  exec(input: string): string {
    const result = execute(this, input);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.stdout;
  }

  execute(input: string): ExecutionResult {
    return execute(this, input);
  }
  executeAsync(input: string): Promise<ExecutionResult> {
    return executeAsync(this, input);
  }
  executeWrite(path: string, content: string): ExecutionResult {
    return executeWrite(this, path, content);
  }

  apply(operations: VfsOperation[]) {
    this.operationQueue.apply(operations);
  }

  plan(input: string): ExecutionPlan {
    return planExecution(this, input);
  }
  planAsync(input: string): Promise<ExecutionPlan> {
    return planExecutionAsync(this, input);
  }
  planWrite(path: string, content: string): ExecutionPlan {
    return planWrite(this, path, content);
  }
  planCache(request: CacheRequest) {
    return planCache(this, request);
  }
  planOperation(request: WorkspaceOperation) {
    return planOperation(this, request);
  }
  planOperationAsync(request: WorkspaceOperation) {
    return planOperationAsync(this, request);
  }
}
