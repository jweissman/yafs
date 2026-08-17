import { ExecutionPlan } from "./types/ExecutionPlan";
import { ExecutionResult } from "./types/ExecutionResult";
import Yafs from "./index";
import { CacheRequest } from "./cache/CacheRequest";
import { cacheRequest } from "./commands/CacheCommands";
import { yafsContext } from "./YafsContext";
import { success, failure } from "./YafsExecutionResult";
import { planWrite } from "./YafsExecutionWrite";

export function execute(yafs: Yafs, input: string): ExecutionResult {
  return applied(yafs, planExecution(yafs, input));
}

export async function executeAsync(
  yafs: Yafs,
  input: string,
): Promise<ExecutionResult> {
  return applied(yafs, await planExecutionAsync(yafs, input));
}

export function executeWrite(
  yafs: Yafs,
  path: string,
  content: string,
): ExecutionResult {
  return applied(yafs, planWrite(yafs, path, content));
}

function applied(yafs: Yafs, plan: ExecutionPlan): ExecutionResult {
  if (!plan.result.error) {
    yafs.operationQueue.apply();
  }
  return plan.result;
}

export function planExecution(yafs: Yafs, input: string): ExecutionPlan {
  return guarded(yafs, () => planned(yafs, input));
}

export async function planExecutionAsync(
  yafs: Yafs,
  input: string,
): Promise<ExecutionPlan> {
  return guardedAsync(yafs, () => plannedAsync(yafs, input));
}

export async function planCache(
  yafs: Yafs,
  request: CacheRequest,
): Promise<ExecutionPlan> {
  return guardedAsync(yafs, () => cachePlan(yafs, request));
}

function guarded(yafs: Yafs, plan: () => ExecutionPlan): ExecutionPlan {
  yafs.operationQueue.reset();
  try {
    return plan();
  } catch (error) {
    return { result: failure(yafs, error), operations: [] };
  }
}

async function guardedAsync(
  yafs: Yafs,
  plan: () => Promise<ExecutionPlan>,
): Promise<ExecutionPlan> {
  yafs.operationQueue.reset();
  return plan().catch((error: unknown) => failed(yafs, error));
}

function failed(yafs: Yafs, error: unknown): ExecutionPlan {
  return { result: failure(yafs, error), operations: [] };
}

async function cachePlan(
  yafs: Yafs,
  request: CacheRequest,
): Promise<ExecutionPlan> {
  const stdout = await cacheRequest(yafsContext(yafs), request);
  yafs.operationQueue.validate();
  const result = success(yafs, stdout);
  return { result, operations: yafs.operationQueue.all() };
}

function planned(yafs: Yafs, input: string): ExecutionPlan {
  const parsed = yafs.interpreter.parse(input);
  const result = success(yafs, yafs.commands.handle(parsed));
  yafs.operationQueue.validate();
  return { result, operations: yafs.operationQueue.all() };
}

async function plannedAsync(yafs: Yafs, input: string): Promise<ExecutionPlan> {
  const parsed = yafs.interpreter.parse(input);
  const result = success(yafs, await yafs.commands.handleAsync(parsed));
  yafs.operationQueue.validate();
  return { result, operations: yafs.operationQueue.all() };
}
