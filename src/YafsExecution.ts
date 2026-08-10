import { AbsolutePath } from "./core/AbsolutePath";
import { errorCode } from "./core/errors";
import { ExecutionPlan } from "./types/ExecutionPlan";
import { ExecutionResult } from "./types/ExecutionResult";
import Yafs from "./index";
import { CacheRequest } from "./cache/CacheRequest";
import { cacheRequest } from "./commands/CacheCommands";
import { yafsContext } from "./YafsContext";

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

export function planWrite(
  yafs: Yafs,
  path: string,
  content: string,
): ExecutionPlan {
  return guarded(yafs, () => plannedWrite(yafs, path, content));
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
  return plan().catch((error) => failed(yafs, error));
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

function plannedWrite(
  yafs: Yafs,
  path: string,
  content: string,
): ExecutionPlan {
  yafs.operationQueue.add(writeOperation(yafs, path, content));
  yafs.operationQueue.validate();
  return { result: success(yafs, ""), operations: yafs.operationQueue.all() };
}

function writeOperation(yafs: Yafs, path: string, content: string) {
  return { type: "write" as const, path: yafs.shell.resolve(path), content };
}

function planned(yafs: Yafs, input: string): ExecutionPlan {
  const result = success(yafs, yafs.handle(yafs.interpreter.parse(input)));
  yafs.operationQueue.validate();
  return { result, operations: yafs.operationQueue.all() };
}

async function plannedAsync(yafs: Yafs, input: string): Promise<ExecutionPlan> {
  const result = success(
    yafs,
    await yafs.handleAsync(yafs.interpreter.parse(input)),
  );
  yafs.operationQueue.validate();
  return { result, operations: yafs.operationQueue.all() };
}

function success(yafs: Yafs, stdout: string): ExecutionResult {
  return { stdout, stderr: "", status: 0, session: session(yafs) };
}

function failure(yafs: Yafs, error: unknown): ExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    stdout: "",
    stderr: message,
    status: message.startsWith("Unknown command:") ? 127 : 1,
    error: { code: errorCode(message), message },
    session: session(yafs),
  };
}

function session(yafs: Yafs) {
  return { user: yafs.user.name, cwd: yafs.shell.pwd as AbsolutePath };
}
