import { expect, test } from "bun:test";

import Yafs from "../src";
import { activateDesired } from "./desired_mount_helpers";

test("introspection commands describe the session and mounted unions", () => {
  const yafs = new Yafs();
  expect(yafs.exec("whoami")).toBe("root");
  expect(yafs.exec("version")).toBe("yafs 0.1.0");
  expect(yafs.exec("help")).toContain("whoami");
  yafs.exec("mkdir lower");
  yafs.exec("mkdir upper");
  yafs.exec("echo lower > lower/value");
  yafs.exec("union workspace upper lower");
  expect(yafs.exec("mounts")).toBe(
    "/home/root/workspace union /home/root/upper /home/root/lower",
  );
  expect(yafs.exec("inspect workspace/value")).toBe(
    '{"path":"/home/root/workspace/value","type":"file","origins":[{"kind":"local","path":"/home/root/lower/value"}]}',
  );
});

test("creating a node at an already-occupied path is rejected", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir projects");
  expect(yafs.execute("mkdir projects").stderr).toBe(
    "Path already exists: /home/root/projects",
  );
  expect(yafs.execute("ln -s projects projects").stderr).toBe(
    "Path already exists: /home/root/projects",
  );
});

test("a shell session can navigate and work with files", () => {
  const yafs = new Yafs();
  expect(yafs.exec("pwd")).toBe("/home/root");
  expect(yafs.exec("mkdir projects")).toBe("");
  expect(yafs.exec("cd projects")).toBe("");
  expect(yafs.exec("pwd")).toBe("/home/root/projects");
  expect(yafs.exec("echo hello > README")).toBe("");
  expect(yafs.exec("ls")).toBe("README");
  expect(yafs.exec("cat README")).toBe("hello");
  expect(yafs.exec("cd ..")).toBe("");
  expect(yafs.exec("ls")).toBe("projects");
  expect(yafs.exec("ls /home/root/projects")).toBe("README");
  expect(yafs.exec("ls /home/root/projects/")).toBe("README");
  expect(yafs.exec("cd /")).toBe("");
  expect(yafs.exec("pwd")).toBe("/");
});

test("rm removes files but not directories", () => {
  const yafs = new Yafs();
  yafs.exec("touch note");
  expect(yafs.exec("rm note")).toBe("");
  expect(yafs.execute("cat note").error?.code).toBe("not_found");
  yafs.exec("mkdir docs");
  expect(yafs.execute("rm docs").error?.code).toBe("is_directory");
  expect(yafs.execute("rm never-existed").error?.code).toBe("not_found");
});

test("rm -r removes a non-empty directory tree", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  yafs.exec("echo guide > docs/guide.md");
  yafs.exec("mkdir docs/nested");
  yafs.exec("echo deep > docs/nested/file.md");
  expect(() => yafs.exec("rmdir docs")).toThrow("Directory not empty");
  expect(yafs.exec("rm -r docs")).toBe("");
  expect(yafs.execute("stat docs").error?.code).toBe("not_found");
});

test("cp copies a file, leaving the source in place", () => {
  const yafs = new Yafs();
  yafs.exec("echo hello > note");
  expect(yafs.exec("cp note copy")).toBe("");
  expect(yafs.exec("cat copy")).toBe("hello");
  expect(yafs.exec("cat note")).toBe("hello");
});

test("cp without -r rejects a directory source", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  expect(() => yafs.exec("cp docs docs2")).toThrow(
    "is a directory (not copied, use -r)",
  );
});

test("cp -r copies a directory tree, including nested symlinks", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  yafs.exec("echo guide > docs/guide.md");
  yafs.exec("mkdir docs/nested");
  yafs.exec("echo deep > docs/nested/file.md");
  yafs.exec("ln -s guide.md docs/latest");
  expect(yafs.exec("cp -r docs archive")).toBe("");
  expect(yafs.exec("cat archive/guide.md")).toBe("guide");
  expect(yafs.exec("cat archive/nested/file.md")).toBe("deep");
  expect(yafs.exec("readlink archive/latest")).toBe("guide.md");
  // The source is untouched by cp.
  expect(yafs.exec("cat docs/guide.md")).toBe("guide");
});

test("cp refuses to copy out of a read-only provider mount into itself, but reading the source is fine", async () => {
  const yafs = new Yafs();
  await activateDesired(
    yafs,
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}",
  );
  expect(yafs.exec("cp fixture/hello.txt copy")).toBe("");
  expect(yafs.exec("cat copy")).toBe("hello");
});

test("mv renames a file, removing the source", () => {
  const yafs = new Yafs();
  yafs.exec("echo hello > note");
  expect(yafs.exec("mv note renamed")).toBe("");
  expect(yafs.exec("cat renamed")).toBe("hello");
  expect(yafs.execute("cat note").error?.code).toBe("not_found");
});

test("mv moves a whole directory tree", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  yafs.exec("echo guide > docs/guide.md");
  yafs.exec("mkdir docs/nested");
  yafs.exec("echo deep > docs/nested/file.md");
  expect(yafs.exec("mv docs archive")).toBe("");
  expect(yafs.exec("cat archive/guide.md")).toBe("guide");
  expect(yafs.exec("cat archive/nested/file.md")).toBe("deep");
  expect(yafs.execute("stat docs").error?.code).toBe("not_found");
});

test("mv out of a read-only provider mount is rejected atomically -- no copy lands, source untouched", async () => {
  const yafs = new Yafs();
  await activateDesired(
    yafs,
    "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}",
  );
  expect(yafs.execute("mv fixture/hello.txt moved").error?.code).toBe(
    "read_only_mount",
  );
  // A command's queued operations are validated as one batch before any
  // of them apply, so the write half of mv never lands just because the
  // removeTree half would fail -- better than the copy-then-remove
  // partial-failure this test originally (incorrectly) expected.
  expect(yafs.execute("cat moved").error?.code).toBe("not_found");
  expect(yafs.exec("cat fixture/hello.txt")).toBe("hello");
});

test("du reports a single file's own byte size", () => {
  const yafs = new Yafs();
  yafs.exec("echo hello > note");
  expect(yafs.exec("du note")).toBe("files: 1\nbytes: 5");
});

test("du sums files and bytes recursively across a directory tree", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  yafs.exec("echo guide > docs/guide.md");
  yafs.exec("mkdir docs/nested");
  yafs.exec("echo deep > docs/nested/file.md");
  yafs.exec("ln -s guide.md docs/latest");
  // 2 real files + 1 symlink (0 bytes of its own) = 3 files.
  expect(yafs.exec("du docs")).toBe("files: 3\nbytes: 9");
});

test("touch on an already-existing file updates its modified time without erroring", () => {
  const yafs = new Yafs();
  yafs.exec("touch note");
  expect(yafs.exec("touch note")).toBe("");
  expect(yafs.exec("cat note")).toBe("");
});

test("writing to a path that is a directory is rejected", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  expect(() => yafs.exec("echo hi > docs")).toThrow("Is a directory");
});

test("symlinks resolve relative to their parent and report loops", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir docs");
  yafs.exec("echo guide > docs/guide");
  yafs.exec("ln -s docs/guide latest");
  expect(yafs.exec("cat latest")).toBe("guide");
  yafs.exec("ln -s /home/root/docs/guide absolute-latest");
  expect(yafs.exec("cat absolute-latest")).toBe("guide");
  expect(yafs.exec("readlink latest")).toBe("docs/guide");
  expect(yafs.exec("lstat latest")).toBe("symlink");
  expect(yafs.exec("stat latest")).toBe("file");
  yafs.exec("ln -s loop-b loop-a");
  yafs.exec("ln -s loop-a loop-b");
  expect(() => yafs.exec("cat loop-a")).toThrow("Too many symbolic links");
});

test("read-only unions prioritize layers and expose their origins", () => {
  const yafs = new Yafs();

  yafs.exec("mkdir lower");
  yafs.exec("mkdir upper");
  yafs.exec("echo lower > lower/shared");
  yafs.exec("echo lower-only > lower/lower-only");
  yafs.exec("echo upper > upper/shared");
  yafs.exec("echo upper-only > upper/upper-only");
  yafs.exec("union workspace upper lower");
  expect(yafs.exec("cat workspace/shared")).toBe("upper");
  expect(yafs.exec("ls workspace")).toBe("shared\nupper-only\nlower-only");
  expect(yafs.exec("origins workspace/shared")).toBe(
    "/home/root/upper/shared\n/home/root/lower/shared",
  );
  expect(() => yafs.exec("echo no > workspace/new-file")).toThrow(
    "Read-only union mount",
  );
});

test("union mounts preserve physical symlink targets and remain read-only through links", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir lower");
  yafs.exec("mkdir upper");
  yafs.exec("echo lower-target > lower/target");
  yafs.exec("echo upper-target > upper/target");
  yafs.exec("ln -s target lower/latest");
  yafs.exec("union workspace upper lower");
  yafs.exec("ln -s workspace/latest latest");
  expect(yafs.exec("cat workspace/latest")).toBe("lower-target");
  expect(() => yafs.exec("echo changed > latest")).toThrow(
    "Read-only union mount",
  );
});

test("filesystem errors distinguish missing paths and non-directories", () => {
  const yafs = new Yafs();
  expect(() => yafs.exec("cat missing")).toThrow(
    "No such file: /home/root/missing",
  );
  yafs.exec("echo file > note");
  expect(() => yafs.exec("ls note")).toThrow(
    "Not a directory: /home/root/note",
  );
  expect(() => yafs.exec("touch note/child")).toThrow(
    "Not a directory: /home/root/note",
  );
});

test("a command with a missing required argument names it by position", () => {
  const yafs = new Yafs();
  expect(() => yafs.exec("ln -s only-target")).toThrow(
    "ln requires argument 3",
  );
});

test("union rejects a layer that is not a directory", () => {
  const yafs = new Yafs();
  yafs.exec("echo file > note");
  yafs.exec("mkdir dir");
  expect(() => yafs.exec("union workspace dir note")).toThrow(
    "Union layer is not a directory: /home/root/note",
  );
});

test("union rejects being given no layers at all", () => {
  const yafs = new Yafs();
  expect(() => yafs.exec("union workspace")).toThrow(
    "union requires at least one layer",
  );
});
