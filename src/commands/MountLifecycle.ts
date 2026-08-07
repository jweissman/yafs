import { CommandContext } from "./CommandContext";

export function lifecycle(context: CommandContext, args: string[]) {
  if (args[0] === "deactivate") {
    return deactivation(context, args[1]);
  }
  return activationOrRefresh(context, args);
}

function activationOrRefresh(context: CommandContext, args: string[]) {
  return args[0] === "refresh"
    ? refresh(context, args)
    : activation(context, args);
}

function activation(context: CommandContext, args: string[]) {
  const record = planned(context, args[1], args[2]);
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
) {
  if (!manifest) {
    throw new Error("plugin requires a manifest path");
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

function refresh(context: CommandContext, args: string[]) {
  if (!args[1]) {
    throw new Error("plugin refresh requires a manifest path");
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

function deactivation(context: CommandContext, id: string | undefined) {
  if (!id) {
    throw new Error("plugin deactivate requires an id");
  }
  context.planUnmount(id);
  context.unmount(id);
  return `${id} deactivated`;
}
