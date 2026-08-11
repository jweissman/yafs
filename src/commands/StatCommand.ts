import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class StatCommand {
  readonly name = "stat";
  readonly synopsis = "stat PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.type(commandPath(context, args, this.name));
  }
}
