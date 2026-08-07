import { BuiltinCommand } from "./BuiltinCommand";
import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";

class MkdirCommand {
  readonly name = "mkdir";
  readonly synopsis = "mkdir PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.mkdir(commandPath(context, args, this.name));
    return "";
  }
}
class TouchCommand {
  readonly name = "touch";
  readonly synopsis = "touch PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.touch(commandPath(context, args, this.name));
    return "";
  }
}
class RmCommand {
  readonly name = "rm";
  readonly synopsis = "rm PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.remove(commandPath(context, args, this.name));
    return "";
  }
}
class RmdirCommand {
  readonly name = "rmdir";
  readonly synopsis = "rmdir PATH";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    context.rmdir(commandPath(context, args, this.name));
    return "";
  }
}
class LnCommand {
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
class UnionCommand {
  readonly name = "union";
  readonly synopsis = "union NAME LAYER...";
  readonly access = "mutate";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return this.compose(context, args);
  }
  private compose(context: CommandContext, args: string[]) {
    const layers = args.slice(1).map((layer) => context.resolve(layer));
    if (!layers.length) {
      throw new Error("union requires at least one layer");
    }
    context.union(commandPath(context, args, this.name), layers);
    return "";
  }
}
class CatCommand {
  readonly name = "cat";
  readonly synopsis = "cat PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.read(commandPath(context, args, this.name));
  }
}
class ReadlinkCommand {
  readonly name = "readlink";
  readonly synopsis = "readlink PATH";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.readlink(commandPath(context, args, this.name));
  }
}
class LsCommand {
  readonly name = "ls";
  readonly synopsis = "ls [PATH]";
  readonly access = "read";
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    return context.list(context.resolve(args[0] || ".")).join("\n");
  }
}
export function filesystemCommands(): BuiltinCommand[] {
  return [...mutatorCommands(), ...readerCommands()];
}

function mutatorCommands(): BuiltinCommand[] {
  return [
    new MkdirCommand(),
    new TouchCommand(),
    new RmCommand(),
    new RmdirCommand(),
    new LnCommand(),
    new UnionCommand(),
  ];
}

function readerCommands(): BuiltinCommand[] {
  return [new CatCommand(), new ReadlinkCommand(), new LsCommand()];
}
