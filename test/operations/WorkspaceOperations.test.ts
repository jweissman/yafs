import { expect, test } from "bun:test";

import Yafs from "../../src";

test("workspace operations return typed VFS values without shell parsing", async () => {
  const yafs = new Yafs();
  await yafs.executeAsync("mkdir work");
  await yafs.executeAsync("echo brief > work/brief.md");

  expect(await yafs.operations.invoke({ name: "list", path: "work" })).toEqual({
    kind: "list",
    path: "/home/root/work",
    entries: ["brief.md"],
  });
  expect(
    await yafs.operations.invoke({ name: "read", path: "work/brief.md" }),
  ).toEqual({
    kind: "read",
    path: "/home/root/work/brief.md",
    text: "brief",
  });
  expect(
    (await yafs.operations.invoke({ name: "inspect", path: "work/brief.md" }))
      .kind,
  ).toBe("inspect");
});

test("yafs.start_here reports principal, cwd, mounts, and an unscoped default", async () => {
  const yafs = new Yafs();
  const value = await yafs.operations.invoke({ name: "startHere" });
  expect(value).toMatchObject({
    kind: "startHere",
    principal: "root",
    cwd: "/home/root",
    scoped: false,
  });
  if (value.kind !== "startHere") {
    throw new Error("expected startHere");
  }
  expect(Array.isArray(value.mounts)).toBe(true);
  expect(value.recommendedFirst.length).toBeGreaterThan(0);
});

test("a typed workspace operation returns a structured failure", () => {
  const result = new Yafs().planOperation({
    name: "read",
    path: "missing",
  }).result;
  expect(result.error).toMatchObject({ code: "not_found" });
  expect(result.status).toBe(1);
});

test("typed evidence operations preserve captured bytes across source changes", async () => {
  const yafs = new Yafs();
  await yafs.executeAsync("mkdir source");
  await yafs.executeAsync("mkdir artifacts");
  await yafs.executeAsync("echo captured > source/a.md");
  const rejected = await yafs.planOperationAsync({
    name: "capture",
    source: "source",
    artifact: "artifacts/rejected",
    limit: 0,
  });
  expect(rejected.result.error?.message).toBe("Result limit exceeded");
  expect(yafs.exec("test -e artifacts/rejected")).toBe("false");
  const capture = await yafs.planOperationAsync({
    name: "capture",
    source: "source",
    artifact: "artifacts/one",
  });
  yafs.apply(capture.operations);
  await yafs.executeAsync("echo current > source/a.md");
  const restore = await yafs.planOperationAsync({
    name: "restore",
    artifact: "artifacts/one",
    destination: "restored",
  });
  yafs.apply(restore.operations);
  expect(capture.result.value).toMatchObject({ kind: "capture", entries: 1 });
  expect(restore.result.value).toMatchObject({ kind: "restore", entries: 1 });
  expect(yafs.exec("cat restored/a.md")).toBe("captured");
  await yafs.executeAsync("mkdir artifacts/oversized");
  yafs.executeWrite("artifacts/oversized/trace.json", oversizedTrace());
  const oversized = await yafs.planOperationAsync({
    name: "restore",
    artifact: "artifacts/oversized",
    destination: "too-many",
  });
  expect(oversized.result.error?.message).toBe("Result limit exceeded");
});

function oversizedTrace() {
  const digest = "a".repeat(64);
  const entries = Array.from({ length: 10001 }, (_, index) => ({
    path: String(index),
    digest,
  }));
  return JSON.stringify({
    kind: "yafs-trace",
    version: 1,
    sourcePath: "/source",
    capturedAt: "2026-01-01T00:00:00.000Z",
    entries,
  });
}
