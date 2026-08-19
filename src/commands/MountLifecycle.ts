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
