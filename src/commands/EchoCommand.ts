import { CommandContext } from "./CommandContext";

export class EchoCommand {
  readonly name = "echo";
  readonly synopsis = "echo [WORD...]";
  readonly access = "read";
  constructor() {}
  execute(_context: CommandContext, args: string[]) {
    return args.join(" ");
  }
}
