import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { commandPath } from "./commandPath";

export class RunCommand implements BuiltinCommand {
  readonly name = "run";
  readonly synopsis = "run PATH [ARGS...]";
  readonly access = "control" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name);
    return context.runProgram(path, args.slice(1));
  }
}
