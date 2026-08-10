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
    throw new Error("plugin deactivate requires an id");
  }
  context.planUnmount(id);
  context.unmount(id);
  return `${id} deactivated`;
}
