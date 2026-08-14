import { expect, test } from "bun:test";

import { commandAst } from "../../src/lang/CommandAst";
import { AstNode } from "../../src/lang/AstNode";

function fakeNode(astValue: unknown): AstNode {
  return { ast: () => astValue } as unknown as AstNode;
}

test("a redirect target that is not a literal word is rejected", () => {
  const command = fakeNode({ kind: "command", name: "echo", args: [] });
  const operator = fakeNode(undefined);
  const path = fakeNode({ kind: "variable", name: "USER" });
  expect(() => commandAst.Command_redirect(command, operator, path)).toThrow(
    "Redirection requires a path",
  );
});
