import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class ReadlinkCommand {
  readonly name = "readlink";
  readonly synopsis = "readlink PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.readlink(commandPath(context, args, this.name));
  }
}
