import { expect, test } from "bun:test";

import { workspace } from "./workspace_helpers";

test("diff reports deterministic virtual file-set changes", async () => {
  const yafs = await workspace();
  await yafs.executeAsync("mkdir changed");
  await yafs.executeAsync("echo different > changed/a.md");
  await yafs.executeAsync("echo added > changed/new.md");
  expect(yafs.operations.invoke({ name: "diff", left: "work", right: "changed" })).toEqual({
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

test("diff compares individual files as well as directories", async () => {
  const yafs = await workspace();
  await yafs.executeAsync("echo same > work/a.md");
  expect(yafs.operations.invoke({ name: "diff", left: "work/a.md", right: "work/a.md" }))
    .toEqual({ kind: "diff", changes: [] });
  await yafs.executeAsync("mkdir changed");
  await yafs.executeAsync("echo different > changed/a.md");
  expect(yafs.operations.invoke({ name: "diff", left: "work/a.md", right: "changed/a.md" }))
    .toEqual({ kind: "diff", changes: [{ path: ".", kind: "changed" }] });
});

test("diff rejects a result set beyond its explicit limit", async () => {
  const yafs = await workspace();
  await yafs.executeAsync("mkdir changed");
  await yafs.executeAsync("echo different > changed/a.md");
  expect(() => yafs.operations.invoke({
    name: "diff", left: "work", right: "changed", limit: 1,
  })).toThrow("Result limit exceeded");
});
