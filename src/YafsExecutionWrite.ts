import { ExecutionPlan } from "./types/ExecutionPlan";
import Yafs from "./index";
import { success, failure } from "./YafsExecutionResult";

export function planWrite(
  yafs: Yafs,
  path: string,
  content: string,
): ExecutionPlan {
  return guardedPlan(yafs, () => plannedWrite(yafs, path, content));
}

function guardedPlan(yafs: Yafs, plan: () => ExecutionPlan): ExecutionPlan {
  yafs.operationQueue.reset();
  try {
    return plan();
  } catch (error) {
    return { result: failure(yafs, error), operations: [] };
  }
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
