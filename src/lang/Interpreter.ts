import * as ohm from "ohm-js";
import grammarContent from "./Yash.ohm" with { type: "text" };
import { Command } from "../types/Command";
import { commandAst } from "./CommandAst";
import { wordAst } from "./WordAst";
import { expressionAst } from "./ExpressionAst";

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
    return astFor(this.semantics, matchResult);
  }
}

function astFor(semantics: ohm.Semantics, match: ohm.MatchResult): Command {
  const apply = semantics as unknown as (value: ohm.MatchResult) => {
    ast: () => unknown;
  };
  const operation = apply(match);
  return operation.ast() as Command;
}
