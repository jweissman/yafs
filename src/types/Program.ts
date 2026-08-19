import { Statement } from "./Statement";

export interface Program {
  kind: "program";
  statements: Statement[];
}
