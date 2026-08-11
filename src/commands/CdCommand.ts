import { CommandContext } from "./CommandContext";

export class CdCommand {
  readonly name = "cd";
  readonly synopsis = "cd PATH";
  readonly access = "session";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.cd(context.required(this.name, args, 0));
    return "";
  }
}
