import { CommandContext } from "./CommandContext";

export function lifecycle(context: CommandContext, args: string[]) {
  if (args[0] === "deactivate") {
    return deactivation(context, args[1]);
  }
  throw new Error(
    "plugin no longer accepts validate|activate|refresh; declare " +
      "instances in a host-side yafs.plugins.yaml and use `plugins apply` " +
      "(see `plugins describe`)",
  );
}

function deactivation(context: CommandContext, id: string | undefined) {
  if (!id) {
    throw new Error("plugin deactivate requires an id, or --all");
  }
  return id === "--all" ? deactivateAll(context) : deactivateOne(context, id);
}

// Known limitation, shared by every mutating command (not introduced
// here): queued operations apply as one batch after this function
// returns, with no per-operation try/catch (YafsOperationQueue.apply).
// If unmounting one id throws mid-batch (e.g. a disk I/O error during
// that mount's audit/persistence write), earlier ids in the list are
// already gone and later ones never ran, with no report of which is
// which beyond the raw error. Low-probability in practice, but a real
// gap; fixing it needs apply() to report partial progress, not a
// change scoped to this command.
function deactivateAll(context: CommandContext) {
  const ids = context.activeMountIds();
  ids.forEach((id) => deactivateOne(context, id));
  return `${String(ids.length)} deactivated: ${ids.join(", ")}`;
}

function deactivateOne(context: CommandContext, id: string) {
  const record = context.planUnmount(id);
  context.unmount(id, record.path);
  return `${id} deactivated`;
}
