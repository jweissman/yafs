import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { renderPrompt } from "../src/yash/prompt";
import { CommandHistory } from "../src/yash/history";
import { completionToken } from "../src/yash/completion";

test("arithmetic expansion uses double parentheses", () => {
  expect(Yafs.exec("echo $((2+2))")).toBe("4");
  expect(new Yafs().execute("echo $(2+2)").error?.code).toBe("parse_error");
});

test("command substitution builds a nested AST and captures deferred output", () => {
  const yafs = new Yafs();
  expect(yafs.exec("echo $(echo hello)")).toBe("hello");
  expect(yafs.interpreter.parse("echo $(cat note)").args[0]).toEqual({
    kind: "substitution",
    command: {
      kind: "command",
      name: "cat",
      args: [{ kind: "literal", value: "note" }],
    },
  });
  expect(yafs.exec('echo "value=$(echo hello)"')).toBe("value=hello");
  expect(yafs.execute("echo $(touch transient)").error?.message).toContain(
    "not read-only",
  );
  expect(yafs.execute("stat transient").error?.code).toBe("not_found");
  expect(yafs.execute("echo $(false)").error?.code).toBe("command_error");
});

test("asynchronous execution preserves deferred substitution isolation", async () => {
  const yafs = new Yafs();
  const result = await yafs.executeAsync("echo $(touch transient)");
  expect(result.error?.message).toContain("not read-only");
  expect((await yafs.executeAsync("stat transient")).error?.code).toBe(
    "not_found",
  );
  expect((await yafs.executeAsync("echo $USER")).stdout).toBe("root");
  expect((await yafs.executeAsync("echo $((2+2))")).stdout).toBe("4");
  expect((await yafs.executeAsync('echo "value=$(echo root)"')).stdout).toBe(
    "value=root",
  );
});

test("command execution reports output, status, errors, and session state", () => {
  const yafs = new Yafs();
  expect(yafs.execute("pwd")).toEqual({
    stdout: "/home/root",
    stderr: "",
    status: 0,
    session: { user: "root", cwd: "/home/root" },
  });
  expect(yafs.execute("unknown")).toEqual({
    stdout: "",
    stderr: "Unknown command: unknown",
    status: 127,
    error: { code: "unknown_command", message: "Unknown command: unknown" },
    session: { user: "root", cwd: "/home/root" },
  });
});

test("execution errors have stable machine-readable codes", () => {
  const yafs = new Yafs();

  expect(yafs.execute("cat missing").error?.code).toBe("not_found");
  expect(yafs.execute("echo $").error?.code).toBe("parse_error");
});

test("quoted and variable words are evaluated only during command execution", () => {
  const yafs = new Yafs();
  expect(yafs.exec("echo 'hello world'")).toBe("hello world");
  expect(yafs.exec('echo "hello $USER"')).toBe("hello root");
  expect(yafs.exec("echo $PWD")).toBe("/home/root");
  yafs.exec("mkdir project");
  yafs.exec("cd project");
  expect(yafs.exec("echo $PWD")).toBe("/home/root/project");
});

test("printf provides exact output for redirection", () => {
  const yafs = new Yafs();
  expect(yafs.exec("printf 'hello world' > message")).toBe("");
  expect(yafs.exec("cat message")).toBe("hello world");
  expect(yafs.exec("help")).toContain("printf");
});

test("clock-backed date and touch avoid host process semantics", () => {
  const yafs = new Yafs({
    clock: { now: () => new Date("2026-07-30T12:00:00.000Z") },
  });

  expect(yafs.exec("date")).toBe("2026-07-30T12:00:00.000Z");
  expect(yafs.exec("touch note")).toBe("");
  expect(yafs.exec("stat note")).toBe("file");
  expect(yafs.execute("false").status).toBe(1);
});

test("prompts render server session state through a template", () => {
  expect(
    renderPrompt(
      "{user}@{server}:{cwd}$ ",
      { user: "root", cwd: "/home/root" },
      "localhost",
    ),
  ).toBe("root@localhost:/home/root$ ");
  expect(
    renderPrompt("[{cwd}] ", { user: "root", cwd: "/work" }, "localhost"),
  ).toBe("[/work] ");
});

test("command history persists locally and ignores consecutive duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-history-"));
  const path = join(directory, "history");
  const history = await CommandHistory.open(path, 3);

  await history.record("pwd");
  await history.record("cd projects");
  await history.record("cd projects");
  await history.record("ls");
  expect(history.entries()).toEqual(["pwd", "cd projects", "ls"]);
  expect((await CommandHistory.open(path, 3)).entries()).toEqual([
    "pwd",
    "cd projects",
    "ls",
  ]);
  expect(history.search("cd")).toBe("cd projects");
});

test("completion replaces only the final word", () => {
  expect(completionToken("cat w")).toBe("w");
  expect(completionToken("cat work/w")).toBe("work/w");
});

test("parsing constructs an arithmetic AST without evaluation", () => {
  const yafs = new Yafs();

  expect(yafs.interpreter.parse("echo $((9-2))")).toEqual({
    kind: "command",
    name: "echo",
    args: [
      {
        kind: "arithmetic",
        expression: {
          kind: "binary",
          operator: "-",
          left: { kind: "number", value: 9 },
          right: { kind: "number", value: 2 },
        },
      },
    ],
  });
});
