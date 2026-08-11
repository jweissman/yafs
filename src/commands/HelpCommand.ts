import { CommandContext } from "./CommandContext";

export class HelpCommand {
  readonly name = "help";
  readonly synopsis = "help";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.help();
  }
}
