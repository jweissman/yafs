import { expect, test } from "bun:test";

import { workspace } from "./workspace_helpers";

test("test -c checks a file's content, not just its existence or type", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-c",
      pattern: "a",
      path: "work/a.md",
    }),
  ).toEqual({ kind: "test", value: true });
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-c",
      pattern: "nope",
      path: "work/a.md",
    }),
  ).toEqual({ kind: "test", value: false });
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-c",
      pattern: "a",
      path: "work/missing",
    }),
  ).toEqual({ kind: "test", value: false });
});

test("test -c requires a pattern", async () => {
  const yafs = await workspace();
  expect(() =>
    yafs.operations.invoke({
      name: "test",
      predicate: "-c",
      path: "work/a.md",
    }),
  ).toThrow("test -c requires a pattern");
});
