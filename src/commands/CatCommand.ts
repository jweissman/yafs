import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class CatCommand {
  readonly name = "cat";
  readonly synopsis = "cat PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.read(commandPath(context, args, this.name));
  }
}
