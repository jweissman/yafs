import { CommandContext } from "./CommandContext";

export class WhoamiCommand {
  readonly name = "whoami";
  readonly synopsis = "whoami";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.user();
  }
}
