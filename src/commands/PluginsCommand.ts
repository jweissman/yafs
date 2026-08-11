import { CommandContext } from "./CommandContext";

export class PluginsCommand {
  readonly name = "plugins";
  readonly synopsis =
    "plugins [describe [NAME]|status|plan|apply [--prune]|refresh ID]";
  // apply/refresh mutate; access is per-command, not per-subcommand, so the
  // whole command must stay non-'read' — matching how `mount` already
  // treats `validate`.
  readonly access = "control";

  constructor() {}

  execute(context: CommandContext, args: string[]): string | Promise<string> {
    if (!args.length || args[0] === "describe") {
      return this.describe(context, args);
    }
    return desired(context, args);
  }

  private describe(context: CommandContext, args: string[]) {
    return JSON.stringify(context.plugins(args[1]));
  }
}

function desired(context: CommandContext, args: string[]) {
  if (args[0] === "apply") {
    return context.applyDesired(args[1] === "--prune").then(JSON.stringify);
  }
  if (args[0] === "refresh") {
    return desiredRefresh(context, args[1]);
  }
  return desiredRead(context, args[0]);
}

function desiredRefresh(context: CommandContext, id: string | undefined) {
  if (!id) {
    throw new Error("plugins refresh requires an id");
  }
  return context.refreshDesired(id).then(JSON.stringify);
}

function desiredRead(context: CommandContext, action: string) {
  if (action === "status") {
    return context.desiredStatus().then(JSON.stringify);
  }
  return action === "plan" ? plannedRead(context) : unknownAction();
}

function plannedRead(context: CommandContext) {
  return context.desiredPlan().then(JSON.stringify);
}

function unknownAction(): never {
  throw new Error(
    "plugins expects describe, status, plan, apply [--prune], or refresh ID",
  );
}
