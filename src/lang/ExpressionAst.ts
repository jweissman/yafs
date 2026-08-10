import { AstNode } from "./AstNode";
import { Expression } from "../types/Expression";

export const expressionAst = {
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
