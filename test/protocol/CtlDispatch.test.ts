import { expect, test } from "bun:test";

import { AbsolutePath } from "../../src/core/AbsolutePath";
import { CtlDispatch } from "../../src/protocol/CtlDispatch";
import { VfsOperation } from "../../src/vfs/VfsOperation";

test("intercept removes a write matching a registered handler and invokes it", async () => {
  const dispatch = new CtlDispatch();
  const seen: string[] = [];
  dispatch.register("/home/root/ctl" as AbsolutePath, (payload) => {
    seen.push(payload);
  });
  const kept = await dispatch.intercept([write("/home/root/ctl", "go")]);
  expect(kept).toEqual([]);
  expect(seen).toEqual(["go"]);
});

test("intercept leaves writes to unregistered paths untouched", async () => {
  const dispatch = new CtlDispatch();
  const operations = [write("/home/root/plain.txt", "hello")];
  expect(await dispatch.intercept(operations)).toEqual(operations);
});

test("intercept leaves non-write operations untouched even at a registered path", async () => {
  const dispatch = new CtlDispatch();
  dispatch.register("/home/root/ctl" as AbsolutePath, () => {});
  const operations: VfsOperation[] = [
    {
      type: "mkdir",
      path: "/home/root/ctl" as AbsolutePath,
      at: new Date().toISOString(),
    },
  ];
  expect(await dispatch.intercept(operations)).toEqual(operations);
});

test("unregister makes a previously intercepted path an ordinary write again", async () => {
  const dispatch = new CtlDispatch();
  const path = "/home/root/ctl" as AbsolutePath;
  dispatch.register(path, () => {});
  dispatch.unregister(path);
  const operations = [write(path, "go")];
  expect(await dispatch.intercept(operations)).toEqual(operations);
});

function write(path: string, content: string): VfsOperation {
  return {
    type: "write",
    path: path as AbsolutePath,
    content,
    at: new Date().toISOString(),
  };
}
