import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class OriginsCommand {
  readonly name = "origins";
  readonly synopsis = "origins PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.origins(commandPath(context, args, this.name)).join("\n");
  }
}
