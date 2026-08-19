import type Yafs from "./index";
import { AbsolutePath } from "./core/AbsolutePath";
import { PathResolver } from "./core/PathResolver";
import { Journal } from "./protocol/Journal";
import { VfsOperation } from "./vfs/VfsOperation";
import { runScript, ScriptRequest } from "./YafsRunProgram";

export interface ScheduledRunResult {
  output?: string;
  error?: string;
}

export type DispatchCtl = (
  path: AbsolutePath,
  payload: string,
) => Promise<boolean>;

export async function runScheduledScript(
  yafs: Yafs,
  journal: Journal,
  dispatchCtl: DispatchCtl,
  request: ScriptRequest,
): Promise<ScheduledRunResult> {
  yafs.operationQueue.reset();
  yafs.shell.enter(PathResolver.home(yafs.user));
  return succeeded(yafs, journal, dispatchCtl, request).catch(errorResult);
}

async function succeeded(
  yafs: Yafs,
  journal: Journal,
  dispatchCtl: DispatchCtl,
  request: ScriptRequest,
): Promise<ScheduledRunResult> {
  const output = await runScript(yafs, request);
  await commit(yafs, journal, dispatchCtl);
  return { output };
}

function errorResult(error: unknown): ScheduledRunResult {
  return { error: messageOf(error) };
}

async function commit(yafs: Yafs, journal: Journal, dispatchCtl: DispatchCtl) {
  yafs.operationQueue.validate();
  const all = yafs.operationQueue.all();
  const operations = await withoutCtlWrites(all, dispatchCtl);
  await journal.commit(operations);
  yafs.operationQueue.apply(operations);
}

async function withoutCtlWrites(
  operations: VfsOperation[],
  dispatchCtl: DispatchCtl,
): Promise<VfsOperation[]> {
  const kept: VfsOperation[] = [];
  for (const operation of operations) {
    await keep(kept, operation, dispatchCtl);
  }
  return kept;
}

async function keep(
  kept: VfsOperation[],
  operation: VfsOperation,
  dispatchCtl: DispatchCtl,
) {
  if (!(await dispatchedCtl(operation, dispatchCtl))) {
    kept.push(operation);
  }
}

function dispatchedCtl(operation: VfsOperation, dispatchCtl: DispatchCtl) {
  return operation.type === "write"
    ? dispatchCtl(operation.path, operation.content)
    : false;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
