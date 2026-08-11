import { BuiltinCommand } from "./BuiltinCommand";
import { filesystemMutatorCommands } from "./FilesystemMutatorCommands";
import { CatCommand } from "./CatCommand";
import { ReadlinkCommand } from "./ReadlinkCommand";
import { LsCommand } from "./LsCommand";

export function filesystemCommands(): BuiltinCommand[] {
  return [...filesystemMutatorCommands(), ...readerCommands()];
}

function readerCommands(): BuiltinCommand[] {
  return [new CatCommand(), new ReadlinkCommand(), new LsCommand()];
}
