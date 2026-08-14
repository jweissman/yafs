import { AbsolutePath } from "./core/AbsolutePath";
import { errorCode } from "./core/errors";
import Yafs from "./index";
import { WorkspaceOperation } from "./operations/WorkspaceOperation";
import { ExecutionPlan } from "./types/ExecutionPlan";
import { ExecutionResult } from "./types/ExecutionResult";
import { evidence, evidencePlan } from "./YafsEvidencePlan";

export function planOperation(yafs: Yafs, operation: WorkspaceOperation) {
  try {
    yafs.operationQueue.reset();
    return planned(yafs, operation);
  } catch (error) {
    return { result: failure(yafs, error), operations: [] };
  }
}

export async function planOperationAsync(
  yafs: Yafs,
  operation: WorkspaceOperation,
) {
  return evidence(operation)
    ? evidencePlan(yafs, operation)
    : planOperation(yafs, operation);
}

function planned(yafs: Yafs, operation: WorkspaceOperation): ExecutionPlan {
  const value = yafs.operations.invoke(operation);
  return { result: success(yafs, render(value), value), operations: [] };
}

function render(value: NonNullable<ExecutionResult["value"]>) {
  if (value.kind === "list") {
    return value.entries.join("\n");
  }
  return value.kind === "read" ? value.text : JSON.stringify(value);
}

export function success(
  yafs: Yafs,
  stdout: string,
  value: NonNullable<ExecutionResult["value"]>,
): ExecutionResult {
  return { stdout, stderr: "", status: 0, value, session: session(yafs) };
}

export function failure(yafs: Yafs, error: unknown): ExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    stdout: "",
    stderr: message,
    status: 1,
    error: { code: errorCode(message), message },
    session: session(yafs),
  };
}

function session(yafs: Yafs) {
  return { user: yafs.user.name, cwd: yafs.shell.pwd as AbsolutePath };
}
