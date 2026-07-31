import * as ohm from 'ohm-js';
import grammarContent from './Yash.ohm' with { type: 'text' };
import { Shell } from '../Shell';
import { AstNode } from './AstNode';
import { Command } from '../types/Command';
import { Expression } from '../types/Expression';
import { Word } from './Word';

export class Interpreter {
  grammar: ohm.Grammar;
  semantics: ohm.Semantics;
  constructor(private shell: Shell) {
    this.grammar = ohm.grammar(grammarContent);
    this.semantics = this.grammar.createSemantics();
    this.semantics.addOperation('ast', { ...this.commandAst(), ...this.wordAst(), ...this.expressionAst() });
  }

  private commandAst() {
    return { Command_plain(command: AstNode) { return command.ast(); },
      Command_redirect(command: AstNode, _operator: AstNode, path: AstNode) { const target = path.ast() as Word; if (target.kind !== 'literal') throw new Error('Redirection requires a path'); return { ...command.ast() as Command, redirect: { kind: 'output', target: target.value } }; },
      FunCall(funCall: AstNode, args: AstNode) { return { kind: 'command', name: funCall.sourceString, args: args.children.map((arg: AstNode) => arg.ast()) }; } };
  }

  private wordAst() {
    return { ShellEscape(_dollar: AstNode, _open: AstNode, _innerOpen: AstNode, expr: AstNode, _innerClose: AstNode, _close: AstNode) { return { kind: 'arithmetic', expression: expr.ast() as Expression }; }, CommandSubstitution(_dollar: AstNode, _open: AstNode, command: AstNode, _close: AstNode) { return { kind: 'substitution', command: command.ast() as Command }; },
      variable(_leader: AstNode, name: AstNode) { return { kind: 'variable', name: name.sourceString }; }, singleQuoted(this: AstNode, _leader: AstNode, _contents: AstNode, _trailer: AstNode) { return { kind: 'literal', value: this.sourceString.slice(1, -1) }; }, DoubleQuoted(_leader: AstNode, parts: AstNode, _trailer: AstNode) { return { kind: 'compound', parts: parts.children.map((part: AstNode) => part.ast() as Word) }; }, DoublePart(part: AstNode) { return part.ast() }, doubleLiteral(this: AstNode, _characters: AstNode) { return { kind: 'literal', value: this.sourceString }; }, path_root(_slash: AstNode) { return { kind: 'literal', value: '/' }; }, path_segments(this: AstNode, _prefix: AstNode, _first: AstNode, _separators: AstNode, _rest: AstNode, _trailing: AstNode) { return { kind: 'literal', value: this.sourceString }; }, identifier(this: AstNode, _first: AstNode, _rest: AstNode) { return { kind: 'literal', value: this.sourceString }; } };
  }

  private expressionAst() {
    return { AddExp_plus(left: AstNode, _op: AstNode, right: AstNode) { return { kind: 'binary', operator: '+', left: left.ast() as Expression, right: right.ast() as Expression }; }, AddExp_minus(left: AstNode, _op: AstNode, right: AstNode) { return { kind: 'binary', operator: '-', left: left.ast() as Expression, right: right.ast() as Expression }; }, PriExp_paren(_open: AstNode, expr: AstNode, _close: AstNode) { return expr.ast(); }, number(_digits: AstNode) { return { kind: 'number', value: parseInt(_digits.sourceString, 10) }; } };
  }

  parse(input: string): Command {
    const matchResult = this.grammar.match(input); if (matchResult.failed()) throw new Error(`Failed to parse input: ${input}`);
    return this.semantics(matchResult).ast() as Command;
  }
}
