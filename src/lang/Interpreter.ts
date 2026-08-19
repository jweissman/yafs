import * as ohm from "ohm-js";
import grammarContent from "./Yash.ohm" with { type: "text" };
import { Command } from "../types/Command";
import { Program } from "../types/Program";
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
    return astFor(this.semantics, this.matched(input, "Command")) as Command;
  }

  parseProgram(input: string): Program {
    const match = this.matched(input, "Program");
    return astFor(this.semantics, match) as Program;
  }

  private matched(input: string, rule: string): ohm.MatchResult {
    const matchResult = this.grammar.match(input, rule);
    if (matchResult.failed()) {
      throw new Error(`Failed to parse input: ${input}`);
    }
    return matchResult;
  }
}

function astFor(semantics: ohm.Semantics, match: ohm.MatchResult): unknown {
  const apply = semantics as unknown as (value: ohm.MatchResult) => {
    ast: () => unknown;
  };
  const operation = apply(match);
  return operation.ast();
}
