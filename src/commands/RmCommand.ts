import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class RmCommand {
  readonly name = "rm";
  readonly synopsis = "rm PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.remove(commandPath(context, args, this.name));
    return "";
  }
}
