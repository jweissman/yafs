import { CommandContext } from "./CommandContext";

export class PwdCommand {
  readonly name = "pwd";
  readonly synopsis = "pwd";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.pwd();
  }
}
