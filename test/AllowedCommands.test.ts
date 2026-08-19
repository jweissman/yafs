import { expect, test } from "bun:test";

import Yafs from "../src/index";

test("a script with only allowed commands runs normally", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram("echo one\necho two");
  const output = await yafs.commands.runProgram(program, {}, ["read"]);
  expect(output).toBe("one\ntwo");
});

test("a script containing a disallowed command is rejected before anything runs", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram("echo before\nmkdir new-dir");
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: mkdir",
  );
  expect(yafs.exec("test -e new-dir")).toBe("false");
});

test("a disallowed command inside an if branch is rejected too", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram(
    "if test -e work {\n  mkdir nested\n}",
  );
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: mkdir",
  );
});

test("a disallowed command inside a nested $() substitution is rejected too", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram('echo "$(mkdir sneaky)"');
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: mkdir",
  );
});

test("a disallowed command inside an else branch is rejected too", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram(
    "if test -e missing {\n  echo yes\n} else {\n  mkdir nested\n}",
  );
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: mkdir",
  );
});

test("an if condition itself is checked against the allow-list", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram(
    "if mkdir probe {\n  echo yes\n}",
  );
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: mkdir",
  );
});

test("an else branch made only of allowed commands completes normally", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram(
    "if test -e missing {\n  echo yes\n} else {\n  echo no\n}",
  );
  await expect(yafs.commands.runProgram(program, {}, ["read"])).resolves.toBe(
    "no",
  );
});

test("an unknown command name is rejected the same as a disallowed one", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram("nonexistentcommand");
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: nonexistentcommand",
  );
});

test("no allow-list means no restriction, matching run's existing human-authority behavior", async () => {
  const yafs = new Yafs();
  const program = yafs.interpreter.parseProgram("mkdir unrestricted");
  await expect(yafs.commands.runProgram(program, {})).resolves.toBe("");
});

test("a read-access command is rejected once it redirects output to a file", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/source.txt", "payload");
  const program = yafs.interpreter.parseProgram(
    "cat source.txt > sneaky-write.txt",
  );
  await expect(yafs.commands.runProgram(program, {}, ["read"])).rejects.toThrow(
    "Command not permitted for this trigger: cat",
  );
  expect(yafs.exec("test -e sneaky-write.txt")).toBe("false");
});

test("a redirect is permitted once mutate is in the allow-list", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/source.txt", "payload");
  const program = yafs.interpreter.parseProgram("cat source.txt > copy.txt");
  await expect(
    yafs.commands.runProgram(program, {}, ["read", "mutate"]),
  ).resolves.toBe("");
});
