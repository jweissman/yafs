import * as ohm from "ohm-js";
import grammarContent from "./Yash.ohm" with { type: "text" };
import { AstNode } from "./AstNode";
import { Command } from "../types/Command";
import { Expression } from "../types/Expression";
import { Word } from "./Word";

export class Interpreter {
  grammar: ohm.Grammar;
  semantics: ohm.Semantics;
  constructor() {
    this.grammar = ohm.grammar(grammarContent);
    this.semantics = this.grammar.createSemantics();
    this.semantics.addOperation("ast", {
      ...commandAst,
      ...wordAst,
      ...expressionAst,
    });
  }

  parse(input: string): Command {
    const matchResult = this.grammar.match(input);
    if (matchResult.failed()) {
      throw new Error(`Failed to parse input: ${input}`);
    }
    return this.semantics(matchResult).ast() as Command;
  }
}

const commandAst = {
  Command_plain(command: AstNode) {
    return command.ast();
  },
  Command_redirect(command: AstNode, _operator: AstNode, path: AstNode) {
    return redirectedCommand(command, path);
  },
  FunCall(funCall: AstNode, args: AstNode) {
    return functionCall(funCall, args);
  },
};

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

const wordAst = {
  ShellEscape(
    _dollar: AstNode,
    _open: AstNode,
    _innerOpen: AstNode,
    expr: AstNode,
    _innerClose: AstNode,
    _close: AstNode,
  ) {
    return { kind: "arithmetic", expression: expr.ast() as Expression };
  },
  CommandSubstitution(
    _dollar: AstNode,
    _open: AstNode,
    command: AstNode,
    _close: AstNode,
  ) {
    return { kind: "substitution", command: command.ast() as Command };
  },
  variable(_leader: AstNode, name: AstNode) {
    return { kind: "variable", name: name.sourceString };
  },
  singleQuoted(
    this: AstNode,
    _leader: AstNode,
    _contents: AstNode,
    _trailer: AstNode,
  ) {
    return { kind: "literal", value: this.sourceString.slice(1, -1) };
  },
  DoubleQuoted(_leader: AstNode, parts: AstNode, _trailer: AstNode) {
    return doubleQuoted(parts);
  },
  DoublePart(part: AstNode) {
    return part.ast();
  },
  doubleLiteral(this: AstNode, _characters: AstNode) {
    return { kind: "literal", value: this.sourceString };
  },
  path_root(_slash: AstNode) {
    return { kind: "literal", value: "/" };
  },
  path_segments(
    this: AstNode,
    _prefix: AstNode,
    _first: AstNode,
    _separators: AstNode,
    _rest: AstNode,
    _trailing: AstNode,
  ) {
    return { kind: "literal", value: this.sourceString };
  },
  identifier(this: AstNode, _first: AstNode, _rest: AstNode) {
    return { kind: "literal", value: this.sourceString };
  },
};

function doubleQuoted(parts: AstNode) {
  return {
    kind: "compound",
    parts: parts.children.map((part: AstNode) => part.ast() as Word),
  };
}

const expressionAst = {
  AddExp_plus(left: AstNode, _op: AstNode, right: AstNode) {
    return binary("+", left, right);
  },
  AddExp_minus(left: AstNode, _op: AstNode, right: AstNode) {
    return binary("-", left, right);
  },
  PriExp_paren(_open: AstNode, expr: AstNode, _close: AstNode) {
    return expr.ast();
  },
  number(_digits: AstNode) {
    return { kind: "number", value: parseInt(_digits.sourceString, 10) };
  },
};

function binary(operator: "+" | "-", left: AstNode, right: AstNode) {
  return {
    kind: "binary",
    operator,
    left: left.ast() as Expression,
    right: right.ast() as Expression,
  };
}
