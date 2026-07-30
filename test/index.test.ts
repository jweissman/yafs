import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";
import { renderPrompt } from "../src/yash/prompt";
import { CommandHistory } from "../src/yash/history";
import { completionToken } from "../src/yash/completion";

test("2 + 2", () => {
  expect(Yafs.exec("echo $(2+2)")).toBe("4")
  expect(Yafs.exec("echo $((2+2))")).toBe("4")
});

test("command execution reports output, status, errors, and session state", () => {
  const yafs = new Yafs();
  expect(yafs.execute("pwd")).toEqual({ stdout: "/home/root", stderr: "", status: 0, session: { user: "root", cwd: "/home/root" } });
  expect(yafs.execute("unknown")).toEqual({ stdout: "", stderr: "Unknown command: unknown", status: 127, error: { code: "unknown_command", message: "Unknown command: unknown" }, session: { user: "root", cwd: "/home/root" } });
});

test("introspection commands describe the session and mounted unions", () => {
  const yafs = new Yafs();

  expect(yafs.exec("whoami")).toBe("root"); expect(yafs.exec("version")).toBe("yafs 0.1.0"); expect(yafs.exec("help")).toContain("whoami");
  yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower > lower/value"); yafs.exec("union workspace upper lower");
  expect(yafs.exec("mounts")).toBe("/home/root/workspace union /home/root/upper /home/root/lower"); expect(yafs.exec("inspect workspace/value")).toBe('{"path":"/home/root/workspace/value","type":"file","origins":["/home/root/lower/value"]}');
});

test("execution errors have stable machine-readable codes", () => {
  const yafs = new Yafs();

  expect(yafs.execute("cat missing").error?.code).toBe("not_found");
  expect(yafs.execute("echo $").error?.code).toBe("parse_error");
});

test("quoted and variable words are evaluated only during command execution", () => {
  const yafs = new Yafs();

  expect(yafs.exec("echo 'hello world'")).toBe("hello world"); expect(yafs.exec('echo "hello $USER"')).toBe("hello root"); expect(yafs.exec("echo $PWD")).toBe("/home/root");
  yafs.exec("mkdir project"); yafs.exec("cd project");
  expect(yafs.exec("echo $PWD")).toBe("/home/root/project");
});

test("printf provides exact output for redirection", () => {
  const yafs = new Yafs();

  expect(yafs.exec("printf 'hello world' > message")).toBe("");
  expect(yafs.exec("cat message")).toBe("hello world");
  expect(yafs.exec("help")).toContain("printf");
});

test("clock-backed date and touch avoid host process semantics", () => {
  const yafs = new Yafs({ clock: { now: () => new Date("2026-07-30T12:00:00.000Z") } });

  expect(yafs.exec("date")).toBe("2026-07-30T12:00:00.000Z");
  expect(yafs.exec("touch note")).toBe("");
  expect(yafs.exec("stat note")).toBe("file");
  expect(yafs.execute("false").status).toBe(1);
});

test("prompts render server session state through a template", () => {
  expect(renderPrompt("{user}@{server}:{cwd}$ ", { user: "root", cwd: "/home/root" }, "localhost"))
    .toBe("root@localhost:/home/root$ ");
  expect(renderPrompt("[{cwd}] ", { user: "root", cwd: "/work" }, "localhost"))
    .toBe("[/work] ");
});

test("command history persists locally and ignores consecutive duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-history-"));
  const path = join(directory, "history");
  const history = await CommandHistory.open(path, 3);

  await history.record("pwd"); await history.record("cd projects"); await history.record("cd projects"); await history.record("ls");
  expect(history.entries()).toEqual(["pwd", "cd projects", "ls"]); expect((await CommandHistory.open(path, 3)).entries()).toEqual(["pwd", "cd projects", "ls"]); expect(history.search("cd")).toBe("cd projects");
});

test("completion replaces only the final word", () => {
  expect(completionToken("cat w")).toBe("w");
  expect(completionToken("cat work/w")).toBe("work/w");
});

test("parsing constructs an AST without evaluating substitutions", () => {
  const yafs = new Yafs();

  expect(yafs.interpreter.parse("echo $(9-2)")).toEqual({ kind: "command", name: "echo", args: [{ kind: "substitution", expression: { kind: "binary", operator: "-", left: { kind: "number", value: 9 }, right: { kind: "number", value: 2 } } }] });
});

test("a shell session can navigate and work with files", () => {
  const yafs = new Yafs();

  expect(yafs.exec("pwd")).toBe("/home/root"); expect(yafs.exec("mkdir projects")).toBe(""); expect(yafs.exec("cd projects")).toBe(""); expect(yafs.exec("pwd")).toBe("/home/root/projects");
  expect(yafs.exec("echo hello > README")).toBe(""); expect(yafs.exec("ls")).toBe("README"); expect(yafs.exec("cat README")).toBe("hello"); expect(yafs.exec("cd ..")).toBe("");
  expect(yafs.exec("ls")).toBe("projects"); expect(yafs.exec("ls /home/root/projects")).toBe("README"); expect(yafs.exec("ls /home/root/projects/")).toBe("README"); expect(yafs.exec("cd /")).toBe(""); expect(yafs.exec("pwd")).toBe("/");
});

test("rm removes files but not directories", () => {
  const yafs = new Yafs();
  yafs.exec("touch note");
  expect(yafs.exec("rm note")).toBe("");
  expect(yafs.execute("cat note").error?.code).toBe("not_found");
  yafs.exec("mkdir docs");
  expect(yafs.execute("rm docs").error?.code).toBe("is_directory");
});

test("symlinks resolve relative to their parent and report loops", () => {
  const yafs = new Yafs();

  yafs.exec("mkdir docs"); yafs.exec("echo guide > docs/guide"); yafs.exec("ln -s docs/guide latest"); expect(yafs.exec("cat latest")).toBe("guide");
  yafs.exec("ln -s /home/root/docs/guide absolute-latest"); expect(yafs.exec("cat absolute-latest")).toBe("guide"); expect(yafs.exec("readlink latest")).toBe("docs/guide");
  expect(yafs.exec("lstat latest")).toBe("symlink"); expect(yafs.exec("stat latest")).toBe("file"); yafs.exec("ln -s loop-b loop-a"); yafs.exec("ln -s loop-a loop-b"); expect(() => yafs.exec("cat loop-a")).toThrow("Too many symbolic links");
});

test("read-only unions prioritize layers and expose their origins", () => {
  const yafs = new Yafs();

  yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower > lower/shared"); yafs.exec("echo lower-only > lower/lower-only");
  yafs.exec("echo upper > upper/shared"); yafs.exec("echo upper-only > upper/upper-only"); yafs.exec("union workspace upper lower");
  expect(yafs.exec("cat workspace/shared")).toBe("upper"); expect(yafs.exec("ls workspace")).toBe("shared\nupper-only\nlower-only");
  expect(yafs.exec("origins workspace/shared")).toBe("/home/root/upper/shared\n/home/root/lower/shared"); expect(() => yafs.exec("echo no > workspace/new-file")).toThrow("Read-only union mount");
});

test("union mounts preserve physical symlink targets and remain read-only through links", () => {
  const yafs = new Yafs();

  yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower-target > lower/target"); yafs.exec("echo upper-target > upper/target");
  yafs.exec("ln -s target lower/latest"); yafs.exec("union workspace upper lower"); yafs.exec("ln -s workspace/latest latest");
  expect(yafs.exec("cat workspace/latest")).toBe("lower-target"); expect(() => yafs.exec("echo changed > latest")).toThrow("Read-only union mount");
});

test("filesystem errors distinguish missing paths and non-directories", () => {
  const yafs = new Yafs();

  expect(() => yafs.exec("cat missing")).toThrow("No such file: /home/root/missing");
  yafs.exec("echo file > note");
  expect(() => yafs.exec("ls note")).toThrow("Not a directory: /home/root/note");
});

test("a yash client talks to a persistent server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-")); const walPath = join(directory, "yafs.wal"); const server = await YafsServer.start({ walPath }); const client = await YashClient.connect(server.address());
  expect(await client.execute("pwd")).toEqual({ stdout: "/home/root", stderr: "", status: 0, session: { user: "root", cwd: "/home/root" } });
  expect(await client.exec("mkdir notes")).toBe(""); expect(await client.exec("cd notes")).toBe(""); expect(await client.exec("echo persistent > today")).toBe(""); expect(await client.exec("touch marker")).toBe(""); expect(await client.complete("cat t")).toEqual(["today"]);
  await client.close(); await server.close();
  const restarted = await YafsServer.start({ walPath }); const reconnected = await YashClient.connect(restarted.address()); expect(await reconnected.exec("cat /home/root/notes/today")).toBe("persistent"); expect(await reconnected.exec("stat /home/root/notes/marker")).toBe("file"); await reconnected.close(); await restarted.close();
});
