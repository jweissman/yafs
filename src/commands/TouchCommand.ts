import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class TouchCommand {
  readonly name = "touch";
  readonly synopsis = "touch PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.touch(commandPath(context, args, this.name));
    return "";
  }
}
