import { AstNode } from "./AstNode";
import { Command } from "../types/Command";
import { IfStatement, Statement } from "../types/Statement";
import { statementList } from "./CommandAst";

export const ifAst = {
  // eslint-disable-next-line max-params
  If_withElse(
    _if: AstNode,
    condition: AstNode,
    thenBlock: AstNode,
    _else: AstNode,
    elseBlock: AstNode,
  ) {
    return ifStatement(condition, thenBlock, elseBlock);
  },
  If_plain(_if: AstNode, condition: AstNode, thenBlock: AstNode) {
    return ifStatement(condition, thenBlock);
  },
  // eslint-disable-next-line max-params
  Block(
    _open: AstNode,
    _leadingNl: AstNode,
    statements: AstNode,
    _trailingNl: AstNode,
    _close: AstNode,
  ): Statement[] {
    return block(statements);
  },
};

function ifStatement(
  condition: AstNode,
  thenBlock: AstNode,
  elseBlock?: AstNode,
): IfStatement {
  const then = thenBlock.ast() as Statement[];
  const branches = { then, ...elseOf(elseBlock) };
  return { kind: "if", condition: condition.ast() as Command, ...branches };
}

function elseOf(elseBlock?: AstNode) {
  return elseBlock ? { else: elseBlock.ast() as Statement[] } : {};
}

function block(statements: AstNode): Statement[] {
  const items = statements.asIteration().children as AstNode[];
  return statementList(items);
}
