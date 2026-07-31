import { AbsolutePath } from './core/AbsolutePath'
import { errorCode } from './core/errors'
import { ExecutionPlan } from './types/ExecutionPlan'
import { ExecutionResult } from './types/ExecutionResult'
import Yafs from './index'

export function execute(yafs: Yafs, input: string): ExecutionResult {
  const plan = planExecution(yafs, input)
  if (!plan.result.error) yafs.operationQueue.apply()
  return plan.result
}

export function planExecution(yafs: Yafs, input: string): ExecutionPlan {
  yafs.operationQueue.reset()
  try { return planned(yafs, input) }
  catch (error) { return { result: failure(yafs, error), operations: [] } }
}

function planned(yafs: Yafs, input: string): ExecutionPlan {
  const result = success(yafs, yafs.handle(yafs.interpreter.parse(input)))
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
