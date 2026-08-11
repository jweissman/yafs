import { CommandContext } from "./CommandContext";

export class DateCommand {
  readonly name = "date";
  readonly synopsis = "date";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext) {
    return context.clock.now().toISOString();
  }
}
