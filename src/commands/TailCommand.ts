import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { count, lines, path } from "./TextCommandHelpers";

export class TailCommand implements BuiltinCommand {
  readonly name = "tail";
  readonly synopsis = "tail -n COUNT PATH";
  readonly access = "read" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return this.selected(context, args).slice(-this.count(args)).join("\n");
  }
  private selected(context: CommandContext, args: string[]) {
    return lines(context.read(context.resolve(this.path(args))));
  }
  private count(args: string[]) {
    return count(args, this.name);
  }
  private path(args: string[]) {
    return path(args, this.name);
  }
}
