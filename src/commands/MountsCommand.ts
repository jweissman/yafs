import { CommandContext } from "./CommandContext";

export class MountsCommand {
  readonly name = "mounts";
  readonly synopsis = "mounts";
  readonly access = "read";

  constructor() {}
  execute(context: CommandContext, args: string[]) {
    if (args.length) {
      throw new Error(
        "mounts only lists VFS composition; use plugins for lifecycle",
      );
    }
    return context.mounts().join("\n");
  }
}
