import { BuiltinCommand } from "./BuiltinCommand";
import { commandPath } from "./commandPath";
import { CommandContext } from "./CommandContext";
import { filesystemMutatorCommands } from "./FilesystemMutatorCommands";

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
  return [...filesystemMutatorCommands(), ...readerCommands()];
}

function readerCommands(): BuiltinCommand[] {
  return [new CatCommand(), new ReadlinkCommand(), new LsCommand()];
}
