import { AstNode } from "./AstNode";
import { Command } from "../types/Command";
import { Expression } from "../types/Expression";
import { Word } from "./Word";

export const wordAst = {
  // Ohm calls each action positionally, one parameter per grammar term —
  // arity is fixed by the ShellEscape rule, not refactorable code shape.
  // eslint-disable-next-line max-params
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
  // Same as ShellEscape above: arity is fixed by the `path -- segments` rule.
  // eslint-disable-next-line max-params
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
};

function doubleQuoted(parts: AstNode) {
  return {
    kind: "compound",
    parts: parts.children.map((part: AstNode) => part.ast() as Word),
  };
}
