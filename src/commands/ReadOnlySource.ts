import { Command } from "../types/Command";
import { Word } from "../lang/Word";
import { Interpreter } from "../lang/Interpreter";
import { builtinCommands } from "./registry";

export function readOnlySource(source: string) {
  const command = new Interpreter().parse(source);
  assertReadOnlyCommand(command);
  return source;
}

export function assertReadOnlyCommand(command: Command) {
  if (command.redirect || access(command.name) !== "read") {
    throw new Error(`Command is not read-only: ${command.name}`);
  }
  command.args.forEach(assertWord);
}

function access(name: string) {
  return builtinCommands().find((command) => command.name === name)?.access;
}

function assertWord(word: Word) {
  if (word.kind === "compound") {
    word.parts.forEach(assertWord);
  }
  if (word.kind === "substitution") {
    assertReadOnlyCommand(word.command);
  }
}
