import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class MkdirCommand {
  readonly name = "mkdir";
  readonly synopsis = "mkdir PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.mkdir(commandPath(context, args, this.name));
    return "";
  }
}
