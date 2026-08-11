import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export function validOperation(value: unknown): value is WorkspaceOperation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return pathOperation(item) || evidenceOperation(item);
}

function pathOperation(item: Record<string, unknown>) {
  return (
    ["list", "read", "inspect", "tree", "find", "test"].includes(
      String(item.name),
    ) && typeof item.path === "string"
  );
}

function evidenceOperation(item: Record<string, unknown>) {
  return (
    grepOperation(item) ||
    diffOperation(item) ||
    captureOperation(item) ||
    restoreOperation(item)
  );
}

function grepOperation(item: Record<string, unknown>) {
  return (
    item.name === "grep" &&
    typeof item.pattern === "string" &&
    Array.isArray(item.paths)
  );
}

function diffOperation(item: Record<string, unknown>) {
  return (
    item.name === "diff" &&
    typeof item.left === "string" &&
    typeof item.right === "string"
  );
}

function captureOperation(item: Record<string, unknown>) {
  return (
    item.name === "capture" &&
    typeof item.source === "string" &&
    typeof item.artifact === "string"
  );
}

function restoreOperation(item: Record<string, unknown>) {
  return (
    item.name === "restore" &&
    typeof item.artifact === "string" &&
    typeof item.destination === "string"
  );
}
