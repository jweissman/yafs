import { expect, test } from "bun:test";

import Yafs from "../src";

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
