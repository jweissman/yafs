import { BuiltinCommand } from "./BuiltinCommand";
import { StatCommand } from "./StatCommand";
import { LstatCommand } from "./LstatCommand";
import { OriginsCommand } from "./OriginsCommand";
import { InspectCommand } from "./InspectCommand";
import { DuCommand } from "./DuCommand";

export function inspectionCommands(): BuiltinCommand[] {
  return [
    new StatCommand(),
    new LstatCommand(),
    new OriginsCommand(),
    new InspectCommand(),
    new DuCommand(),
  ];
}
