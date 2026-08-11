import type { BuiltinCommand } from "./BuiltinCommand";
import { HelpCommand } from "./HelpCommand";
import { VersionCommand } from "./VersionCommand";
import { WhoamiCommand } from "./WhoamiCommand";
import { DateCommand } from "./DateCommand";
import { TrueCommand } from "./TrueCommand";
import { FalseCommand } from "./FalseCommand";
import { EchoCommand } from "./EchoCommand";
import { PrintfCommand } from "./PrintfCommand";
import { PwdCommand } from "./PwdCommand";
import { CdCommand } from "./CdCommand";

export function sessionCommands(): BuiltinCommand[] {
  return [...infoCommands(), ...shellCommands()];
}

function infoCommands(): BuiltinCommand[] {
  return [
    new HelpCommand(),
    new VersionCommand(),
    new WhoamiCommand(),
    new DateCommand(),
  ];
}

function shellCommands(): BuiltinCommand[] {
  return [
    new TrueCommand(),
    new FalseCommand(),
    new EchoCommand(),
    new PrintfCommand(),
    new PwdCommand(),
    new CdCommand(),
  ];
}
