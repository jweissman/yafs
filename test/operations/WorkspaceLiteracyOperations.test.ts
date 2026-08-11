import { expect, test } from "bun:test";

import { TreeEntry } from "../../src/operations/WorkspaceOperation";
import { workspace } from "./workspace_helpers";

test("tree and find walk a virtual directory in deterministic order", async () => {
  const yafs = await workspace();
  expect(yafs.operations.invoke({ name: "tree", path: "work" })).toEqual({
    kind: "tree",
    path: "/home/root/work",
    entries: treeEntries(),
  });
  expect(
    yafs.operations.invoke({ name: "find", path: "work", pattern: "*.md" }),
  ).toEqual({
    kind: "find",
    paths: ["/home/root/work/a.md", "/home/root/work/nested/b.md"],
  });
  expect(
    yafs.operations.invoke({ name: "find", path: "work", pattern: "*a*.md" }),
  ).toEqual({
    kind: "find",
    paths: ["/home/root/work/a.md"],
  });
});

test("tree/find bounds are explicit", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({ name: "tree", path: "work", depth: 1 }),
  ).toMatchObject({
    entries: [
      { path: "/home/root/work/a.md" },
      { path: "/home/root/work/nested" },
    ],
  });
  expect(
    yafs.operations.invoke({ name: "find", path: "work", type: "directory" }),
  ).toMatchObject({
    paths: ["/home/root/work", "/home/root/work/nested"],
  });
});

test("test predicates are explicit", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-f",
      path: "work/a.md",
    }),
  ).toEqual({ kind: "test", value: true });
  expect(
    yafs.operations.invoke({ name: "test", predicate: "-d", path: "work" }),
  ).toEqual({ kind: "test", value: true });
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-e",
      path: "work/missing",
    }),
  ).toEqual({ kind: "test", value: false });
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-f",
      path: "work/missing",
    }),
  ).toEqual({ kind: "test", value: false });
  expect(
    yafs.operations.invoke({
      name: "test",
      predicate: "-L",
      path: "work/nested/latest",
    }),
  ).toEqual({ kind: "test", value: true });
});

test("Yash exposes the typed literacy limits and filters", async () => {
  const yafs = await workspace();
  expect(yafs.exec("tree work --depth 1 --limit 2")).toBe(
    "/home/root/work/a.md\n/home/root/work/nested",
  );
  expect(yafs.exec("find work --name '*.md' --type file --limit 2")).toBe(
    "/home/root/work/a.md\n/home/root/work/nested/b.md",
  );
  expect(yafs.exec("diff work work --limit 0")).toBe("");
  expect(yafs.exec("test -L work/nested/latest")).toBe("true");
});

test("grep retains each matching file and line in its typed result", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "b",
      paths: ["work/a.md", "work/nested/b.md"],
    }),
  ).toEqual({
    kind: "grep",
    matches: [{ path: "/home/root/work/nested/b.md", line: 1, text: "b" }],
  });
});

test("grep rejects a result set beyond its explicit limit", async () => {
  const yafs = await workspace();
  expect(() =>
    yafs.operations.invoke({
      name: "grep",
      pattern: "",
      paths: ["work/a.md", "work/nested/b.md"],
      limit: 1,
    }),
  ).toThrow("Result limit exceeded");
});

test("diff reports deterministic virtual file-set changes", async () => {
  const yafs = await workspace();
  await yafs.executeAsync("mkdir changed");
  await yafs.executeAsync("echo different > changed/a.md");
  await yafs.executeAsync("echo added > changed/new.md");
  expect(
    yafs.operations.invoke({ name: "diff", left: "work", right: "changed" }),
  ).toEqual({
    kind: "diff",
    changes: [
      { path: "a.md", kind: "changed" },
      { path: "nested/b.md", kind: "removed" },
      { path: "new.md", kind: "added" },
    ],
  });
  expect(yafs.exec("diff work changed")).toBe(
    "changed a.md\nremoved nested/b.md\nadded new.md",
  );
});

function treeEntries(): TreeEntry[] {
  return [
    { path: "/home/root/work/a.md", type: "file", depth: 1 },
    { path: "/home/root/work/nested", type: "directory", depth: 1 },
    { path: "/home/root/work/nested/b.md", type: "file", depth: 2 },
    { path: "/home/root/work/nested/latest", type: "symlink", depth: 2 },
  ];
}
