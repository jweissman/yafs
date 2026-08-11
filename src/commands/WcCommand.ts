import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { lines, path } from "./TextCommandHelpers";

export class WcCommand implements BuiltinCommand {
  readonly name = "wc";
  readonly synopsis = "wc -l PATH";
  readonly access = "read" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return String(this.value(context, args));
  }
  private value(context: CommandContext, args: string[]) {
    return lines(context.read(context.resolve(path(args, this.name)))).length;
  }
}
