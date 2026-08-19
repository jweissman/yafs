import { expect, test } from "bun:test";

import { TreeEntry } from "../../src/operations/WorkspaceOperation";
import { workspace } from "./workspace_helpers";

test("tree and find walk a virtual directory in deterministic order", async () => {
  const yafs = await workspace();
  expect(yafs.operations.invoke({ name: "tree", path: "work" })).toEqual({
    kind: "tree",
    path: "/home/root/work",
    entries: treeEntries(),
    truncated: false,
  });
  expect(
    yafs.operations.invoke({ name: "find", path: "work", pattern: "*.md" }),
  ).toEqual({
    kind: "find",
    paths: ["/home/root/work/a.md", "/home/root/work/nested/b.md"],
    truncated: false,
  });
  expect(
    yafs.operations.invoke({ name: "find", path: "work", pattern: "*a*.md" }),
  ).toEqual({
    kind: "find",
    paths: ["/home/root/work/a.md"],
    truncated: false,
  });
});

test("find truncates a result set beyond its explicit limit, rather than failing", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "find",
      path: "work",
      pattern: "*.md",
      limit: 1,
    }),
  ).toEqual({
    kind: "find",
    paths: ["/home/root/work/a.md"],
    truncated: true,
  });
});

test("tree truncates a result set beyond its explicit limit, rather than failing", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "tree",
      path: "work",
      depth: 1,
      limit: 1,
    }),
  ).toEqual({
    kind: "tree",
    path: "/home/root/work",
    entries: [{ path: "/home/root/work/a.md", type: "file", depth: 1 }],
    truncated: true,
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
    truncated: false,
    count: 1,
    files: ["/home/root/work/nested/b.md"],
  });
});

test("grep truncates a result set beyond its explicit limit, rather than failing", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "",
      paths: ["work/a.md", "work/nested/b.md"],
      limit: 1,
    }),
  ).toMatchObject({ kind: "grep", truncated: true });
});

test("grep searches a whole directory recursively when given one, instead of requiring each file listed individually", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({ name: "grep", pattern: "b", paths: ["work"] }),
  ).toEqual({
    kind: "grep",
    matches: [{ path: "/home/root/work/nested/b.md", line: 1, text: "b" }],
    truncated: false,
    count: 1,
    files: ["/home/root/work/nested/b.md"],
  });
});

test("grep expands a single wildcard path segment against real directory listings", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "b",
      paths: ["work/*/b.md"],
    }),
  ).toEqual({
    kind: "grep",
    matches: [{ path: "/home/root/work/nested/b.md", line: 1, text: "b" }],
    truncated: false,
    count: 1,
    files: ["/home/root/work/nested/b.md"],
  });
});

test("grep expands a partial wildcard pattern like *.md, not just a bare *", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "a",
      paths: ["work/*.md"],
    }),
  ).toMatchObject({
    matches: [{ path: "/home/root/work/a.md" }],
  });
});

test("grep expands ** across any depth, not just one segment", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "b",
      paths: ["work/**/b.md"],
    }),
  ).toMatchObject({
    matches: [{ path: "/home/root/work/nested/b.md" }],
  });

  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "a",
      paths: ["work/**/a.md"],
    }),
  ).toMatchObject({
    matches: [{ path: "/home/root/work/a.md" }],
  });
});

test("grep ignoreCase matches regardless of case", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "B",
      paths: ["work"],
      ignoreCase: true,
    }),
  ).toMatchObject({
    matches: [{ path: "/home/root/work/nested/b.md" }],
  });
  expect(
    yafs.operations.invoke({ name: "grep", pattern: "B", paths: ["work"] }),
  ).toMatchObject({ matches: [] });
});

test("grep invert matches lines that do NOT contain the pattern", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "b",
      paths: ["work"],
      invert: true,
    }),
  ).toMatchObject({
    matches: [{ path: "/home/root/work/a.md", text: "a" }],
  });
});

test("grep countOnly and filesOnly report the aggregate without full match detail", async () => {
  const yafs = await workspace();
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "",
      paths: ["work"],
      countOnly: true,
    }),
  ).toMatchObject({ matches: [], count: 2 });
  expect(
    yafs.operations.invoke({
      name: "grep",
      pattern: "",
      paths: ["work"],
      filesOnly: true,
    }),
  ).toMatchObject({
    matches: [],
    files: ["/home/root/work/a.md", "/home/root/work/nested/b.md"],
  });
});

function treeEntries(): TreeEntry[] {
  return [
    { path: "/home/root/work/a.md", type: "file", depth: 1 },
    { path: "/home/root/work/nested", type: "directory", depth: 1 },
    { path: "/home/root/work/nested/b.md", type: "file", depth: 2 },
    { path: "/home/root/work/nested/latest", type: "symlink", depth: 2 },
  ];
}
