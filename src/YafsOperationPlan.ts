import { AbsolutePath } from "./core/AbsolutePath";
import { errorCode } from "./core/errors";
import Yafs from "./index";
import {
  CaptureValue,
  RestoreValue,
  WorkspaceOperation,
} from "./operations/WorkspaceOperation";
import { capture, restore } from "./traces/EvidenceOperations";
import { yafsContext } from "./YafsContext";
import { ExecutionPlan } from "./types/ExecutionPlan";
import { ExecutionResult } from "./types/ExecutionResult";

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

async function evidencePlan(yafs: Yafs, operation: EvidenceOperation) {
  yafs.operationQueue.reset();
  try {
    return await plannedEvidence(yafs, operation);
  } catch (error) {
    return { result: failure(yafs, error), operations: [] };
  }
}

function planned(yafs: Yafs, operation: WorkspaceOperation): ExecutionPlan {
  const value = yafs.operations.invoke(operation);
  return { result: success(yafs, render(value), value), operations: [] };
}

async function plannedEvidence(yafs: Yafs, operation: EvidenceOperation) {
  const value =
    operation.name === "capture"
      ? captureValue(yafs, operation)
      : restoreValue(yafs, operation);
  return appliedEvidence(yafs, await value);
}

function appliedEvidence(yafs: Yafs, value: CaptureValue | RestoreValue) {
  yafs.operationQueue.validate();
  return {
    result: success(yafs, JSON.stringify(value), value),
    operations: yafs.operationQueue.all(),
  };
}

function captureValue(
  yafs: Yafs,
  operation: Extract<EvidenceOperation, { name: "capture" }>,
) {
  const context = yafsContext(yafs);
  const source = yafs.shell.resolve(operation.source);
  const artifact = yafs.shell.resolve(operation.artifact);
  return capture(context, source, artifact, operation.limit);
}

function restoreValue(
  yafs: Yafs,
  operation: Extract<EvidenceOperation, { name: "restore" }>,
) {
  const context = yafsContext(yafs);
  return restore(
    context,
    yafs.shell.resolve(operation.artifact),
    yafs.shell.resolve(operation.destination),
  );
}

type EvidenceOperation = Extract<
  WorkspaceOperation,
  { name: "capture" | "restore" }
>;
function evidence(
  operation: WorkspaceOperation,
): operation is EvidenceOperation {
  return operation.name === "capture" || operation.name === "restore";
}

function render(value: NonNullable<ExecutionResult["value"]>) {
  if (value.kind === "list") {
    return value.entries.join("\n");
  }
  return value.kind === "read" ? value.text : JSON.stringify(value);
}

function success(
  yafs: Yafs,
  stdout: string,
  value: NonNullable<ExecutionResult["value"]>,
): ExecutionResult {
  return { stdout, stderr: "", status: 0, value, session: session(yafs) };
}

function failure(yafs: Yafs, error: unknown): ExecutionResult {
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
