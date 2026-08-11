import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class RmdirCommand {
  readonly name = "rmdir";
  readonly synopsis = "rmdir PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.rmdir(commandPath(context, args, this.name));
    return "";
  }
}
