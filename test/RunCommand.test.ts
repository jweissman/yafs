import { expect, test } from "bun:test";

import Yafs from "../src/index";

test("run executes each line of a script in sequence", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/script.yash", "echo one\necho two");
  const result = await yafs.executeAsync("run script.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("one\ntwo");
});

test("run binds script arguments as $1, $2, ... for the script body only", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/greet.yash", 'echo "Hello, $1! ($2)"');
  const result = await yafs.executeAsync('run greet.yash "Ada" admin');
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("Hello, Ada! (admin)");
});

test("positional bindings do not leak outside the script that bound them", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/echo1.yash", "echo $1");
  await yafs.executeAsync("run echo1.yash inside");
  expect(yafs.exec('echo "$1"')).toBe("");
});

test("a nested $() substitution inside a script sees its positional bindings too", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/note.txt", "the-note");
  yafs.store.write("/home/root/wrap.yash", 'echo "[$(cat $1)]"');
  const result = await yafs.executeAsync("run wrap.yash note.txt");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("[the-note]");
});

test("a script run fails atomically -- a later failing line leaves no partial effects", async () => {
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/partial.yash",
    "touch first.txt\nnonexistent-command",
  );
  const result = await yafs.executeAsync("run partial.yash");
  expect(result.error).toBeDefined();
  expect(yafs.exec("test -e first.txt")).toBe("false");
});

test("run is rejected inside a read-only $() substitution", () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/noop.yash", "pwd");
  const result = yafs.execute('echo "$(run noop.yash)"');
  expect(result.error?.message).toBe("Command is not read-only: run");
});

test("run reports a clear error for a missing script path", async () => {
  const yafs = new Yafs();
  const result = await yafs.executeAsync("run missing.yash");
  expect(result.error).toBeDefined();
});

test("if runs its then-branch when the condition's output is exactly true", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/present.txt", "x");
  yafs.store.write(
    "/home/root/check.yash",
    "if test -f present.txt {\n  echo found\n}",
  );
  const result = await yafs.executeAsync("run check.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("found");
});

test("if with no else produces no output when the condition is false", async () => {
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/check.yash",
    "if test -f missing.txt {\n  echo found\n}",
  );
  const result = await yafs.executeAsync("run check.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("");
});

test("if/else runs the else-branch when the condition is false", async () => {
  const yafs = new Yafs();
  yafs.store.write(
    "/home/root/check.yash",
    "if test -f missing.txt {\n  echo found\n} else {\n  echo absent\n}",
  );
  const result = await yafs.executeAsync("run check.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("absent");
});

test("if branches can nest and can contain more than one statement", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/a.txt", "x");
  yafs.store.write("/home/root/b.txt", "x");
  yafs.store.write(
    "/home/root/check.yash",
    [
      "if test -f a.txt {",
      "  if test -f b.txt {",
      "    echo both",
      "    echo present",
      "  }",
      "}",
    ].join("\n"),
  );
  const result = await yafs.executeAsync("run check.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("both\npresent");
});

test("a script combines test -c with if to react to a file's content", async () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/status.json", '{"ciStatus":"failure"}');
  yafs.store.write(
    "/home/root/monitor.yash",
    [
      'if test -c \'"ciStatus":"failure"\' status.json {',
      "  echo master is red",
      "} else {",
      "  echo master is green",
      "}",
    ].join("\n"),
  );
  const result = await yafs.executeAsync("run monitor.yash");
  expect(result.error).toBeUndefined();
  expect(result.stdout).toBe("master is red");
});
