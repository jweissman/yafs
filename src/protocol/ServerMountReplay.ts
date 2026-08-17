import { MountManager } from "../mounts/MountManager";
import { VfsOperation } from "../vfs/VfsOperation";

export function replay(mounts: MountManager) {
  return (operation: VfsOperation) => {
    replayOperation(mounts, operation);
  };
}

function replayOperation(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === "mount") {
    replayActivation(mounts, operation);
    return;
  }
  replayLifecycle(mounts, operation);
}

function replayActivation(
  mounts: MountManager,
  operation: Extract<VfsOperation, { type: "mount" }>,
) {
  mounts.replay.activation(operation.record);
}

function replayLifecycle(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === "refresh") {
    mounts.replay.refresh(operation.record);
    return;
  }
  if (operation.type === "unmount") {
    mounts.replay.unmount(operation.id, operation.path);
  }
}
