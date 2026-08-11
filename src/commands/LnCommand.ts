import { CommandContext } from "./CommandContext";

export class LnCommand {
  readonly name = "ln";
  readonly synopsis = "ln -s TARGET LINK";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    if (args[0] !== "-s") {
      throw new Error(
        "Only symbolic links are supported; use ln -s TARGET LINK",
      );
    }
    this.link(context, args);
    return "";
  }

  private link(context: CommandContext, args: string[]) {
    const target = context.required(this.name, args, 1);
    const link = context.resolve(context.required(this.name, args, 2));
    context.symlink(target, link);
  }
}
