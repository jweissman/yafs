import Yafs from "./index";
import {
  CaptureValue,
  RestoreValue,
  WorkspaceOperation,
} from "./operations/WorkspaceOperation";
import { capture, restore } from "./traces/EvidenceOperations";
import { yafsContext } from "./YafsContext";
import { failure, success } from "./YafsOperationPlan";

export type EvidenceOperation = Extract<
  WorkspaceOperation,
  { name: "capture" | "restore" }
>;

export function evidence(
  operation: WorkspaceOperation,
): operation is EvidenceOperation {
  return operation.name === "capture" || operation.name === "restore";
}

export async function evidencePlan(yafs: Yafs, operation: EvidenceOperation) {
  yafs.operationQueue.reset();
  try {
    return await plannedEvidence(yafs, operation);
  } catch (error) {
    return { result: failure(yafs, error), operations: [] };
  }
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
  const artifact = yafs.shell.resolve(operation.artifact);
  const destination = yafs.shell.resolve(operation.destination);
  return restore(context, artifact, destination);
}
