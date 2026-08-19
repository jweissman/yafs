import { CommandContext } from "./CommandContext";
import { copy } from "./CpCommand";

export class MvCommand {
  readonly name = "mv";
  readonly synopsis = "mv SOURCE DEST";
  readonly access = "mutate" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const source = context.resolve(context.required(this.name, args, 0));
    const dest = context.resolve(context.required(this.name, args, 1));

    copy({ context, source, dest, recursive: true });
    context.removeTree(source);
    return "";
  }
}
