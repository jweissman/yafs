import { Word } from "../lang/Word";

export interface Command {
  kind: "command";
  name: string;
  args: Word[];
  redirect?: { kind: "output"; target: string };
}
