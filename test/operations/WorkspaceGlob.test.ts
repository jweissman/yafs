import { expect, test } from "bun:test";

import { CommandContext } from "../../src/commands/CommandContext";
import { expandGlob } from "../../src/operations/WorkspaceGlob";

test("a wildcard skips an unreadable directory instead of failing the operation", () => {
  expect(expandGlob(unreadableContext(), "*")).toEqual([]);
});

function unreadableContext(): CommandContext {
  return {
    resolve: () => "/*",
    list: () => { throw new Error("unreadable"); },
  } as unknown as CommandContext;
}
