import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class LstatCommand {
  readonly name = "lstat";
  readonly synopsis = "lstat PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.type(commandPath(context, args, this.name), false);
  }
}
