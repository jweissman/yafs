import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class InspectCommand {
  readonly name = "inspect";
  readonly synopsis = "inspect PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name);
    return JSON.stringify({
      path,
      type: context.type(path),
      origins: context.provenance(path),
    });
  }
}
