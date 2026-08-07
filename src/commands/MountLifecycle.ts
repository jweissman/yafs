import { CommandContext } from "./CommandContext";

export type LifecycleNames = { name: string; deactivate: string };

export function lifecycle(
  context: CommandContext,
  args: string[],
  names: LifecycleNames,
) {
  if (args[0] === names.deactivate) {
    return deactivation(context, args[1], names);
  }
  if (args[0] === "refresh") {
    return refresh(context, args, names.name);
  }
  return activation(context, args, names.name);
}

function activation(context: CommandContext, args: string[], name: string) {
  const record = planned(context, args[1], args[2], name);
  if (args[0] !== "activate") {
    return JSON.stringify(record);
  }
  return activatePrepared(context, context.prepareMount(record));
}

function activatePrepared(
  context: CommandContext,
  prepared:
    | import("../mounts/types").PreparedMountRecord
    | Promise<import("../mounts/types").PreparedMountRecord>,
) {
  return prepared instanceof Promise
    ? prepared.then((value) => activate(context, value))
    : activate(context, prepared);
}

function planned(
  context: CommandContext,
  manifest: string | undefined,
  id: string | undefined,
  name: string,
) {
  if (!manifest) {
    throw new Error(`${name} requires a manifest path`);
  }
  return context.planMount(context.resolve(manifest), id);
}

function activate(
  context: CommandContext,
  record: import("../mounts/types").PreparedMountRecord,
) {
  context.mount(record);
  return `${record.id} active`;
}

function refresh(context: CommandContext, args: string[], name: string) {
  if (!args[1]) {
    throw new Error(`${name} refresh requires a manifest path`);
  }
  const prepared = context.planRefresh(context.resolve(args[1]), args[2]);
  return refreshPrepared(context, prepared);
}

function refreshPrepared(
  context: CommandContext,
  prepared:
    | import("../mounts/types").PreparedMountRecord
    | Promise<import("../mounts/types").PreparedMountRecord>,
) {
  if (prepared instanceof Promise) {
    return prepared.then((record) => refreshed(context, record));
  }
  return refreshed(context, prepared);
}

function refreshed(
  context: CommandContext,
  record: import("../mounts/types").PreparedMountRecord,
) {
  context.refresh(record);
  return `${record.id} refreshed`;
}

function deactivation(
  context: CommandContext,
  id: string | undefined,
  names: LifecycleNames,
) {
  if (!id) {
    throw new Error(`${names.name} ${names.deactivate} requires an id`);
  }
  context.planUnmount(id);
  context.unmount(id);
  return deactivationResult(id, names.deactivate);
}

function deactivationResult(id: string, action: string) {
  return `${id} ${action === "unmount" ? "unmounted" : "deactivated"}`;
}
