import { AstNode } from "./AstNode";
import { Command } from "../types/Command";
import { Program } from "../types/Program";
import { Statement } from "../types/Statement";
import { Word } from "./Word";
import { ifAst } from "./IfAst";

export const commandAst = {
  Command_plain(command: AstNode) {
    return command.ast();
  },
  Command_redirect(command: AstNode, _operator: AstNode, path: AstNode) {
    return redirectedCommand(command, path);
  },
  FunCall(funCall: AstNode, args: AstNode) {
    return functionCall(funCall, args);
  },
  Program(_leadingNl: AstNode, statements: AstNode, _trailingNl: AstNode) {
    return program(statements);
  },
  ...ifAst,
};

function program(statements: AstNode): Program {
  const items = statements.asIteration().children as AstNode[];
  return { kind: "program", statements: statementList(items) };
}

export function statementList(items: AstNode[]): Statement[] {
  return items.map((item) => item.ast() as Statement);
}

function redirectedCommand(command: AstNode, path: AstNode) {
  const target = path.ast() as Word;
  if (target.kind !== "literal") {
    throw new Error("Redirection requires a path");
  }
  return {
    ...(command.ast() as Command),
    redirect: { kind: "output", target: target.value },
  };
}

function functionCall(funCall: AstNode, args: AstNode) {
  return {
    kind: "command",
    name: funCall.sourceString,
    args: args.children.map((arg: AstNode) => arg.ast()),
  };
}
