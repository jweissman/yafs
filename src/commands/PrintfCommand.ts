import { CommandContext } from "./CommandContext";

export class PrintfCommand {
  readonly name = "printf";
  readonly synopsis = "printf [WORD...]";
  readonly access = "read";
  constructor() {}
  execute(_context: CommandContext, args: string[]) {
    return args.join("");
  }
}
