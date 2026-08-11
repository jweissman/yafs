import { BuiltinCommand } from "./BuiltinCommand";
import { GrepCommand } from "./GrepCommand";
import { HeadCommand } from "./HeadCommand";
import { TailCommand } from "./TailCommand";
import { WcCommand } from "./WcCommand";

export function textCommands(): BuiltinCommand[] {
  return [
    new GrepCommand(),
    new HeadCommand(),
    new TailCommand(),
    new WcCommand(),
  ];
}
