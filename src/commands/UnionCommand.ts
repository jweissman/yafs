import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

export class UnionCommand {
  readonly name = "union";
  readonly synopsis = "union NAME LAYER...";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return this.compose(context, args);
  }
  private compose(context: CommandContext, args: string[]) {
    const layers = args.slice(1).map((layer) => context.resolve(layer));
    context.union(commandPath(context, args, this.name), layers);
    return "";
  }
}
