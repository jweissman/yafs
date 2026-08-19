import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class CatCommand {
  readonly name = "cat";
  readonly synopsis = "cat PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name);
    const backing = context.gitBacking(path);
    return backing ? context.gitRead(backing) : context.read(path);
  }
}
