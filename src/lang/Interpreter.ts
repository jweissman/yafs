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
    return this.semantics(matchResult).ast() as Command;
  }
}
