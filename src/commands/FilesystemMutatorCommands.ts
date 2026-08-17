import { MkdirCommand } from "./MkdirCommand";
import { TouchCommand } from "./TouchCommand";
import { RmCommand } from "./RmCommand";
import { RmdirCommand } from "./RmdirCommand";
import { LnCommand } from "./LnCommand";
import { UnionCommand } from "./UnionCommand";
import { CpCommand } from "./CpCommand";
import { MvCommand } from "./MvCommand";

export function filesystemMutatorCommands() {
  return [
    new MkdirCommand(),
    new TouchCommand(),
    new RmCommand(),
    new RmdirCommand(),
    new LnCommand(),
    ...moreMutatorCommands(),
  ];
}

function moreMutatorCommands() {
  return [new UnionCommand(), new CpCommand(), new MvCommand()];
}
