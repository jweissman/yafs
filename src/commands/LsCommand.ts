import { CommandContext } from "./CommandContext";

export class LsCommand {
  readonly name = "ls";
  readonly synopsis = "ls [PATH]";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.list(context.resolve(args[0] || ".")).join("\n");
  }
}
