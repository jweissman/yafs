import { expect, test } from "bun:test";
import { access, appendFile, mkdtemp, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";
import { renderPrompt } from "../src/yash/prompt";
import { CommandHistory } from "../src/yash/history";
import { completionToken } from "../src/yash/completion";
import { currentState, paths } from "../src/daemon";
import { LocalYashClient } from "../src/protocol/local";

test("arithmetic expansion uses double parentheses", () => {
  expect(Yafs.exec("echo $((2+2))")).toBe("4")
  expect(new Yafs().execute("echo $(2+2)").error?.code).toBe("parse_error")
});

test("command substitution builds a nested AST and captures deferred output", () => {
  const yafs = new Yafs(); expect(yafs.exec("echo $(echo hello)")).toBe("hello"); expect(yafs.interpreter.parse("echo $(cat note)").args[0]).toEqual({ kind: "substitution", command: { kind: "command", name: "cat", args: [{ kind: "literal", value: "note" }] } });
  expect(yafs.exec('echo "value=$(echo hello)"')).toBe("value=hello")
  expect(yafs.exec("echo $(touch transient)")).toBe(""); expect(yafs.execute("stat transient").error?.code).toBe("not_found"); expect(yafs.execute("echo $(false)").error?.code).toBe("command_error");
});

test("command execution reports output, status, errors, and session state", () => {
  const yafs = new Yafs();
  expect(yafs.execute("pwd")).toEqual({ stdout: "/home/root", stderr: "", status: 0, session: { user: "root", cwd: "/home/root" } });
  expect(yafs.execute("unknown")).toEqual({ stdout: "", stderr: "Unknown command: unknown", status: 127, error: { code: "unknown_command", message: "Unknown command: unknown" }, session: { user: "root", cwd: "/home/root" } });
});

test("introspection commands describe the session and mounted unions", () => {
  const yafs = new Yafs(); expect(yafs.exec("whoami")).toBe("root"); expect(yafs.exec("version")).toBe("yafs 0.1.0"); expect(yafs.exec("help")).toContain("whoami");
  yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower > lower/value"); yafs.exec("union workspace upper lower");
  expect(yafs.exec("mounts")).toBe("/home/root/workspace union /home/root/upper /home/root/lower"); expect(yafs.exec("inspect workspace/value")).toBe('{"path":"/home/root/workspace/value","type":"file","origins":[{"kind":"local","path":"/home/root/lower/value"}]}');
});

test("execution errors have stable machine-readable codes", () => {
  const yafs = new Yafs();

  expect(yafs.execute("cat missing").error?.code).toBe("not_found");
  expect(yafs.execute("echo $").error?.code).toBe("parse_error");
});

test("quoted and variable words are evaluated only during command execution", () => {
  const yafs = new Yafs(); expect(yafs.exec("echo 'hello world'")).toBe("hello world"); expect(yafs.exec('echo "hello $USER"')).toBe("hello root"); expect(yafs.exec("echo $PWD")).toBe("/home/root");
  yafs.exec("mkdir project"); yafs.exec("cd project");
  expect(yafs.exec("echo $PWD")).toBe("/home/root/project");
});

test("printf provides exact output for redirection", () => {
  const yafs = new Yafs(); expect(yafs.exec("printf 'hello world' > message")).toBe("");
  expect(yafs.exec("cat message")).toBe("hello world");
  expect(yafs.exec("help")).toContain("printf");
});

test("clock-backed date and touch avoid host process semantics", () => {
  const yafs = new Yafs({ clock: { now: () => new Date("2026-07-30T12:00:00.000Z") } });

  expect(yafs.exec("date")).toBe("2026-07-30T12:00:00.000Z"); expect(yafs.exec("touch note")).toBe(""); expect(yafs.exec("stat note")).toBe("file"); expect(yafs.execute("false").status).toBe(1);
});

test("prompts render server session state through a template", () => {
  expect(renderPrompt("{user}@{server}:{cwd}$ ", { user: "root", cwd: "/home/root" }, "localhost")).toBe("root@localhost:/home/root$ "); expect(renderPrompt("[{cwd}] ", { user: "root", cwd: "/work" }, "localhost")).toBe("[/work] ");
});

test("command history persists locally and ignores consecutive duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-history-")); const path = join(directory, "history"); const history = await CommandHistory.open(path, 3);

  await history.record("pwd"); await history.record("cd projects"); await history.record("cd projects"); await history.record("ls");
  expect(history.entries()).toEqual(["pwd", "cd projects", "ls"]); expect((await CommandHistory.open(path, 3)).entries()).toEqual(["pwd", "cd projects", "ls"]); expect(history.search("cd")).toBe("cd projects");
});

test("completion replaces only the final word", () => {
  expect(completionToken("cat w")).toBe("w");
  expect(completionToken("cat work/w")).toBe("work/w");
});

test("parsing constructs an arithmetic AST without evaluation", () => {
  const yafs = new Yafs();

  expect(yafs.interpreter.parse("echo $((9-2))")).toEqual({ kind: "command", name: "echo", args: [{ kind: "arithmetic", expression: { kind: "binary", operator: "-", left: { kind: "number", value: 9 }, right: { kind: "number", value: 2 } } }] });
});

test("a shell session can navigate and work with files", () => {
  const yafs = new Yafs(); expect(yafs.exec("pwd")).toBe("/home/root"); expect(yafs.exec("mkdir projects")).toBe(""); expect(yafs.exec("cd projects")).toBe(""); expect(yafs.exec("pwd")).toBe("/home/root/projects");
  expect(yafs.exec("echo hello > README")).toBe(""); expect(yafs.exec("ls")).toBe("README"); expect(yafs.exec("cat README")).toBe("hello"); expect(yafs.exec("cd ..")).toBe("");
  expect(yafs.exec("ls")).toBe("projects"); expect(yafs.exec("ls /home/root/projects")).toBe("README"); expect(yafs.exec("ls /home/root/projects/")).toBe("README"); expect(yafs.exec("cd /")).toBe(""); expect(yafs.exec("pwd")).toBe("/");
});

test("rm removes files but not directories", () => {
  const yafs = new Yafs();
  yafs.exec("touch note"); expect(yafs.exec("rm note")).toBe(""); expect(yafs.execute("cat note").error?.code).toBe("not_found");
  yafs.exec("mkdir docs"); expect(yafs.execute("rm docs").error?.code).toBe("is_directory");
});

test("symlinks resolve relative to their parent and report loops", () => {
  const yafs = new Yafs(); yafs.exec("mkdir docs"); yafs.exec("echo guide > docs/guide"); yafs.exec("ln -s docs/guide latest"); expect(yafs.exec("cat latest")).toBe("guide");
  yafs.exec("ln -s /home/root/docs/guide absolute-latest"); expect(yafs.exec("cat absolute-latest")).toBe("guide"); expect(yafs.exec("readlink latest")).toBe("docs/guide");
  expect(yafs.exec("lstat latest")).toBe("symlink"); expect(yafs.exec("stat latest")).toBe("file"); yafs.exec("ln -s loop-b loop-a"); yafs.exec("ln -s loop-a loop-b"); expect(() => yafs.exec("cat loop-a")).toThrow("Too many symbolic links");
});

test("read-only unions prioritize layers and expose their origins", () => {
  const yafs = new Yafs();

  yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower > lower/shared"); yafs.exec("echo lower-only > lower/lower-only"); yafs.exec("echo upper > upper/shared"); yafs.exec("echo upper-only > upper/upper-only"); yafs.exec("union workspace upper lower");
  expect(yafs.exec("cat workspace/shared")).toBe("upper"); expect(yafs.exec("ls workspace")).toBe("shared\nupper-only\nlower-only"); expect(yafs.exec("origins workspace/shared")).toBe("/home/root/upper/shared\n/home/root/lower/shared"); expect(() => yafs.exec("echo no > workspace/new-file")).toThrow("Read-only union mount");
});

test("union mounts preserve physical symlink targets and remain read-only through links", () => {
  const yafs = new Yafs(); yafs.exec("mkdir lower"); yafs.exec("mkdir upper"); yafs.exec("echo lower-target > lower/target"); yafs.exec("echo upper-target > upper/target");
  yafs.exec("ln -s target lower/latest"); yafs.exec("union workspace upper lower"); yafs.exec("ln -s workspace/latest latest");
  expect(yafs.exec("cat workspace/latest")).toBe("lower-target"); expect(() => yafs.exec("echo changed > latest")).toThrow("Read-only union mount");
});

test("filesystem errors distinguish missing paths and non-directories", () => {
  const yafs = new Yafs(); expect(() => yafs.exec("cat missing")).toThrow("No such file: /home/root/missing");
  yafs.exec("echo file > note");
  expect(() => yafs.exec("ls note")).toThrow("Not a directory: /home/root/note");
});

test("a yash client talks to a persistent server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-")); const walPath = join(directory, "yafs.wal"); const server = await YafsServer.start({ walPath }); const client = await YashClient.connect(server.address()); expect(await client.execute("pwd")).toEqual({ stdout: "/home/root", stderr: "", status: 0, session: { user: "root", cwd: "/home/root" } });
  expect(await client.exec("mkdir notes")).toBe(""); expect(await client.exec("cd notes")).toBe(""); expect(await client.exec("echo persistent > today")).toBe(""); expect(await client.exec("touch marker")).toBe(""); expect(await client.complete("cat t")).toEqual(["today"]); await client.close(); await server.close();
  const restarted = await YafsServer.start({ walPath }); const reconnected = await YashClient.connect(restarted.address()); expect(await reconnected.exec("cat /home/root/notes/today")).toBe("persistent"); expect(await reconnected.exec("stat /home/root/notes/marker")).toBe("file"); await reconnected.close(); await restarted.close();
});

test("a malformed request closes only that client connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-protocol-")); const server = await YafsServer.start({ walPath: join(directory, "yafs.wal") });
  const malformed = createConnection(server.address()); await new Promise<void>((resolve, reject) => { malformed.once("connect", () => malformed.write("not-json\n")); malformed.once("close", resolve); malformed.once("error", reject); });
  const client = await YashClient.connect(server.address()); expect(await client.exec("pwd")).toBe("/home/root"); await client.close(); await server.close();
});

test("journal ignores a torn final record but rejects earlier corruption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-recovery-")); const walPath = join(directory, "journal.ndjson"); const server = await YafsServer.start({ walPath }); const client = await YashClient.connect(server.address()); await client.exec("touch durable"); await client.close(); await server.close(); await appendFile(walPath, '{"torn"');
  const recovered = await YafsServer.start({ walPath }); const restored = await YashClient.connect(recovered.address()); expect(await restored.exec("stat durable")).toBe("file"); await restored.close(); await recovered.close();
  await appendFile(walPath, "bad record\n"); await expect(YafsServer.start({ walPath })).rejects.toThrow("Corrupt journal record");
});

test("journal snapshots compact committed state and lock its data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-snapshot-")); const server = await YafsServer.start({ dataDir: directory }); const client = await YashClient.connect(server.address()); await expect(YafsServer.start({ dataDir: directory })).rejects.toThrow(); for (let index = 0; index < 32; index++) await client.exec(`touch item-${index}`);
  await client.close(); await server.close(); await access(join(directory, "journal.ndjson.snapshot"));
  const restarted = await YafsServer.start({ dataDir: directory }); const reconnected = await YashClient.connect(restarted.address()); expect(await reconnected.exec("stat item-31")).toBe("file"); await reconnected.close(); await restarted.close();
});

test("yafsd has managed start, status, and stop lifecycle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-daemon-")); expect(daemon("start", directory)).toContain("started"); expect(await currentState(paths(directory).state)).toBeDefined(); expect(daemon("status", directory)).toContain("running"); expect(daemon("stop", directory)).toContain("stopped"); expect(daemon("status", directory)).toContain("stopped");
});

test("a local yash client offers an in-process development mode", async () => {
  const client = new LocalYashClient(); expect(await client.exec("touch local")).toBe(""); expect(await client.exec("stat local")).toBe("file"); await client.close();
});

test("a validated manifest activates a read-only fixture mount with provenance", () => {
  const yafs = new Yafs(); yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  verifyFixture(yafs)
  expect(JSON.parse(yafs.exec("inspect fixture/hello.txt")).origins[0]).toMatchObject({ kind: "provider", mountId: "demo", provider: "fixture" });
});

test("mount activation persists state, audit, and fixture content across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-mount-")); const server = await YafsServer.start({ dataDir: directory }); const client = await YashClient.connect(server.address()); await client.exec(`printf '${fixtureManifest()}' > .yafsmeta`); await client.exec("mount activate .yafsmeta"); await client.close(); await server.close();
  await access(join(directory, "mounts.json")); await access(join(directory, "audit.ndjson")); expect(await readFile(join(directory, "audit.ndjson"), "utf8")).toContain('"afterRevision":"fixture:'); const restarted = await YafsServer.start({ dataDir: directory }); const restored = await YashClient.connect(restarted.address()); expect(await restored.exec("cat /home/root/fixture/hello.txt")).toBe("hello"); await restored.exec("mount unmount demo"); await restored.exec("mount activate .yafsmeta"); await restored.close(); await restarted.close(); expect(auditSequences(await readFile(join(directory, "audit.ndjson"), "utf8"))).toEqual([1, 2, 3]);
});

test("mount manifests reject unknown fields and unmount removes the provider view", () => {
  const yafs = new Yafs(); yafs.store.write("/home/root/.yafsmeta", "{version: 1, mounts: [], unknown: true}"); expect(yafs.execute("mount validate .yafsmeta").stderr).toBe("Unknown manifest field");
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest().replace("capabilities: []", "capabilities: [network]")); expect(yafs.execute("mount activate .yafsmeta").stderr).toBe("Capabilities are not granted: network");
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest()); yafs.exec("mount activate .yafsmeta"); expect(yafs.exec("mount unmount demo")).toBe("demo unmounted"); expect(yafs.execute("cat fixture/hello.txt").error?.code).toBe("not_found");
});

test("mount manifests reject duplicate keys, YAML tags, aliases, and anchors", () => {
  const yafs = new Yafs()
  invalidManifests().forEach(manifest => expectInvalidManifest(yafs, manifest))
});

function expectInvalidManifest(yafs: Yafs, manifest: string) {
  yafs.store.write("/home/root/.yafsmeta", manifest)
  expect(yafs.execute("mount validate .yafsmeta").stderr).toBe("Invalid .yafsmeta YAML")
}

function invalidManifests() {
  return ["{version: 1, version: 1, mounts: []}", "!custom {version: 1, mounts: []}",
    "{version: 1, mounts: *declared}", "{version: 1, mounts: &declared []}"]
}

function auditSequences(source: string) {
  return source.trim().split("\n").map(line => JSON.parse(line).sequence)
}

function fixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}"
}

function verifyFixture(yafs: Yafs) {
  expect(yafs.exec("mount validate .yafsmeta")).toContain('"id":"demo"'); expect(yafs.exec("mount activate .yafsmeta")).toBe("demo active");
  expect(yafs.exec("ls")).toContain("fixture"); expect(yafs.exec("cat fixture/hello.txt")).toBe("hello"); expect(yafs.execute("echo changed > fixture/hello.txt").error?.code).toBe("read_only_mount");
}

function daemon(command: string, dataDir: string) {
  const child = Bun.spawnSync([process.execPath, join(process.cwd(), "src/yafsd.ts"), command], { env: { ...process.env, YAFS_DATA_DIR: dataDir, YAFS_PORT: "0" }, stdout: "pipe", stderr: "pipe" }); if (child.exitCode) throw new Error(new TextDecoder().decode(child.stderr)); return new TextDecoder().decode(child.stdout)
}
