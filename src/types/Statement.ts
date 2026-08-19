import { Command } from "./Command";

export interface IfStatement {
  kind: "if";
  condition: Command;
  then: Statement[];
  else?: Statement[];
}

export type Statement = Command | IfStatement;
