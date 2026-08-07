import { Expression } from "../types/Expression";
import type { Command } from "../types/Command";

export type Word =
  | { kind: "literal"; value: string }
  | { kind: "variable"; name: string }
  | { kind: "compound"; parts: Word[] }
  | { kind: "arithmetic"; expression: Expression }
  | { kind: "substitution"; command: Command };
