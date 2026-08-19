import { CommandAccess } from "./BuiltinCommand";
import { Command } from "../types/Command";
import { Statement } from "../types/Statement";
import { Word } from "../lang/Word";
import { builtinCommands } from "./registry";

export function assertAllowedStatements(
  statements: Statement[],
  allow: CommandAccess[],
) {
  statements.forEach((statement) => {
    assertAllowed(statement, allow);
  });
}

function assertAllowed(statement: Statement, allow: CommandAccess[]) {
  if (statement.kind === "if") {
    assertAllowedIf(statement, allow);
    return;
  }
  assertAllowedCommand(statement, allow);
}

function assertAllowedIf(
  statement: Extract<Statement, { kind: "if" }>,
  allow: CommandAccess[],
) {
  assertAllowedCommand(statement.condition, allow);
  assertAllowedStatements(statement.then, allow);
  if (statement.else) {
    assertAllowedStatements(statement.else, allow);
  }
}

function assertAllowedCommand(command: Command, allow: CommandAccess[]) {
  const access = accessOf(command.name);
  if (!access || !allow.includes(access)) {
    throw new Error(`Command not permitted for this trigger: ${command.name}`);
  }
  assertAllowedRedirect(command, allow);
  command.args.forEach((word) => {
    assertAllowedWord(word, allow);
  });
}

function assertAllowedRedirect(command: Command, allow: CommandAccess[]) {
  if (command.redirect && !allow.includes("mutate")) {
    throw new Error(`Command not permitted for this trigger: ${command.name}`);
  }
}

function assertAllowedWord(word: Word, allow: CommandAccess[]) {
  if (word.kind === "compound") {
    word.parts.forEach((part) => {
      assertAllowedWord(part, allow);
    });
  }
  if (word.kind === "substitution") {
    assertAllowedCommand(word.command, allow);
  }
}

function accessOf(name: string): CommandAccess | undefined {
  return builtinCommands().find((command) => command.name === name)?.access;
}
