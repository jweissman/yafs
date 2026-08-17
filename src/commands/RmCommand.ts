import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class RmCommand {
  readonly name = "rm";
  readonly synopsis = "rm [-r] PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const { path, recursive } = parsed(context, args, this.name);
    if (recursive) {
      context.removeTree(path);
    } else {
      context.remove(path);
    }
    return "";
  }
}

function parsed(context: CommandContext, args: string[], name: string) {
  const recursive = args[0] === "-r";
  const path = commandPath(context, recursive ? args.slice(1) : args, name);
  return { path, recursive };
}
