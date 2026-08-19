import { expect, test } from "bun:test";

import Yafs from "../src/index";
import { Journal } from "../src/protocol/Journal";
import { DispatchCtl, runScheduledScript } from "../src/YafsScheduledRun";

function fakeJournal(onCommit?: (count: number) => void) {
  return {
    commit: async (operations: unknown[]) => onCommit?.(operations.length),
  } as unknown as Journal;
}

const noCtl: DispatchCtl = async () => false;

test("a scheduled script's mutations are applied and journaled", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/touch.yash", "touch made.txt");
  let committed = -1;
  const journal = fakeJournal((count) => (committed = count));

  const result = await runScheduledScript(yafs, journal, noCtl, {
    path: "/home/root/touch.yash",
    args: [],
    allow: ["mutate"],
  });

  expect(result.error).toBeUndefined();
  expect(yafs.exec("test -e made.txt")).toBe("true");
  expect(committed).toBeGreaterThan(0);
});

test("a scheduled script's output is returned, not just its side effects", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/greet.yash", "echo hello");

  const result = await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/greet.yash",
    args: [],
    allow: ["read"],
  });

  expect(result).toEqual({ output: "hello" });
});

test("a disallowed command is captured as an error, not thrown, and journals nothing", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/sneaky.yash", "mkdir nested");
  let committed = false;
  const journal = fakeJournal(() => (committed = true));

  const result = await runScheduledScript(yafs, journal, noCtl, {
    path: "/home/root/sneaky.yash",
    args: [],
    allow: ["read"],
  });

  expect(result.error).toBe("Command not permitted for this trigger: mkdir");
  expect(committed).toBe(false);
  expect(yafs.exec("test -e nested")).toBe("false");
});

test("a mid-script failure leaves no partial effect and is captured as an error", async () => {
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/partial.yash",
    "touch first.txt\nnonexistentcommand",
  );

  const result = await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/partial.yash",
    args: [],
    allow: ["mutate"],
  });

  expect(result.error).toBeDefined();
  expect(yafs.exec("test -e first.txt")).toBe("false");
});

test("a script's cd does not leak into the next scheduled run", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir other");
  yafs.exec("mkdir other/place");
  yafs.store.write("/home/root/wander.yash", "cd other/place");
  yafs.store.write("/home/root/where.yash", "pwd");

  await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/wander.yash",
    args: [],
    allow: ["session"],
  });
  const result = await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/where.yash",
    args: [],
    allow: ["read"],
  });

  expect(result).toEqual({ output: "/home/root" });
});

test("a missing script path is captured as an error", async () => {
  const yafs = new Yafs();

  const result = await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/missing.yash",
    args: [],
    allow: ["read"],
  });

  expect(result.error).toBeDefined();
  expect(typeof result.error).toBe("string");
});

test("a write to a registered ctl path invokes the handler instead of becoming a file", async () => {
  const yafs = new Yafs();
  yafs.exec("mkdir thing");
  yafs.store.write("/home/root/trigger.yash", "echo hello > thing/ctl");
  const received: string[] = [];
  const dispatchCtl: DispatchCtl = async (path, payload) => {
    if (path === "/home/root/thing/ctl") {
      received.push(payload);
      return true;
    }
    return false;
  };

  const result = await runScheduledScript(yafs, fakeJournal(), dispatchCtl, {
    path: "/home/root/trigger.yash",
    args: [],
    allow: ["read", "mutate"],
  });

  expect(result.error).toBeUndefined();
  expect(received).toEqual(["hello"]);
  expect(yafs.exec("test -e thing/ctl")).toBe("false");
});

test("a write to an unregistered path is journaled normally, ctl dispatch declining it", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/trigger.yash", "echo hello > plain.txt");

  const result = await runScheduledScript(yafs, fakeJournal(), noCtl, {
    path: "/home/root/trigger.yash",
    args: [],
    allow: ["read", "mutate"],
  });

  expect(result.error).toBeUndefined();
  expect(yafs.exec("cat plain.txt")).toBe("hello");
});
