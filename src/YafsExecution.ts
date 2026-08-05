import { AbsolutePath } from './core/AbsolutePath'
import { errorCode } from './core/errors'
import { ExecutionPlan } from './types/ExecutionPlan'
import { ExecutionResult } from './types/ExecutionResult'
import Yafs from './index'
import { CacheRequest } from './cache/CacheRequest'
import { cacheRequest } from './commands/CacheCommands'
import { yafsContext } from './YafsContext'

export function execute(yafs: Yafs, input: string): ExecutionResult {
  const plan = planExecution(yafs, input)
  if (!plan.result.error) yafs.operationQueue.apply()
  return plan.result
}

export async function executeAsync(yafs: Yafs, input: string): Promise<ExecutionResult> {
  const plan = await planExecutionAsync(yafs, input)
  if (!plan.result.error) yafs.operationQueue.apply()
  return plan.result
}

export function planExecution(yafs: Yafs, input: string): ExecutionPlan {
  yafs.operationQueue.reset()
  try { return planned(yafs, input) }
  catch (error) { return { result: failure(yafs, error), operations: [] } }
}

export async function planExecutionAsync(yafs: Yafs, input: string): Promise<ExecutionPlan> {
  yafs.operationQueue.reset()
  try { return await plannedAsync(yafs, input) }
  catch (error) { return { result: failure(yafs, error), operations: [] } }
}

export function executeWrite(yafs: Yafs, path: string, content: string): ExecutionResult {
  const plan = planWrite(yafs, path, content)
  if (!plan.result.error) yafs.operationQueue.apply()
  return plan.result
}

export function planWrite(yafs: Yafs, path: string, content: string): ExecutionPlan {
  yafs.operationQueue.reset()
  try { return plannedWrite(yafs, path, content) }
  catch (error) { return { result: failure(yafs, error), operations: [] } }
}
export async function planCache(yafs: Yafs, request: CacheRequest): Promise<ExecutionPlan> {
  yafs.operationQueue.reset()
  try { return await cachePlan(yafs, request) }
  catch (error) { return { result: failure(yafs, error), operations: [] } }
}
async function cachePlan(yafs: Yafs, request: CacheRequest): Promise<ExecutionPlan> {
  const stdout = await cacheRequest(yafsContext(yafs), request); yafs.operationQueue.validate()
  return { result: success(yafs, stdout), operations: yafs.operationQueue.all() }
}

function plannedWrite(yafs: Yafs, path: string, content: string): ExecutionPlan {
  yafs.operationQueue.add({ type: 'write', path: yafs.shell.resolve(path), content })
  yafs.operationQueue.validate(); return { result: success(yafs, ''), operations: yafs.operationQueue.all() }
}

function planned(yafs: Yafs, input: string): ExecutionPlan {
  const result = success(yafs, yafs.handle(yafs.interpreter.parse(input)))
  yafs.operationQueue.validate()
  return { result, operations: yafs.operationQueue.all() }
}

async function plannedAsync(yafs: Yafs, input: string): Promise<ExecutionPlan> {
  const result = success(yafs, await yafs.handleAsync(yafs.interpreter.parse(input)))
  yafs.operationQueue.validate()
  return { result, operations: yafs.operationQueue.all() }
}

function success(yafs: Yafs, stdout: string): ExecutionResult {
  return { stdout, stderr: '', status: 0, session: session(yafs) }
}

function failure(yafs: Yafs, error: unknown): ExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { stdout: '', stderr: message, status: message.startsWith('Unknown command:') ? 127 : 1,
    error: { code: errorCode(message), message }, session: session(yafs) }
}

function session(yafs: Yafs) { return { user: yafs.user.name, cwd: yafs.shell.pwd as AbsolutePath } }
