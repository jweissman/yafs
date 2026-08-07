import { expect, test } from "bun:test";

import Yafs from "../src";
import { commandPath } from "../src/commands/commandPath";
import { CommandContext } from "../src/commands/CommandContext";
import { CacheService } from "../src/cache/CacheService";
import { memoryBlobStore } from "../src/protocol/MemoryBlobStore";
import { TraceService } from "../src/traces/TraceService";

test("command helpers resolve required paths without executing a command", () => {
  expect(commandPath(commandContext(), ["note"], "touch")).toBe(
    "/home/root/note",
  );
});

test("session command objects provide the standard session commands", () => {
  const yafs = new Yafs();
  expect(yafs.exec("help")).toContain("pwd");
  expect(yafs.exec("version")).toContain("yafs");
  expect(yafs.exec("whoami")).toBe("root");
  expect(yafs.exec("date")).toContain("T");
  expect(yafs.exec("true")).toBe("");
  expect(yafs.execute("false").status).toBe(1);
  expect(yafs.exec("echo hello")).toBe("hello");
  expect(yafs.exec("printf hello")).toBe("hello");
  expect(yafs.exec("pwd")).toBe("/home/root");
  yafs.exec("mkdir next");
  expect(yafs.exec("cd next")).toBe("");
});

test("plugins desired-state commands report unconfigured instead of throwing when there is no daemon config", async () => {
  const yafs = new Yafs();
  expect(
    JSON.parse(
      await yafs.executeAsync("plugins status").then((result) => result.stdout),
    ),
  ).toEqual({ configured: false });
  expect(
    JSON.parse(
      await yafs.executeAsync("plugins plan").then((result) => result.stdout),
    ),
  ).toEqual([]);
  expect((await yafs.executeAsync("plugins apply")).error?.message).toBe(
    "No daemon mount configuration",
  );
  expect(
    (await yafs.executeAsync("plugins refresh review")).error?.message,
  ).toBe("No daemon mount configuration");
});

test("rmdir removes an empty directory but refuses a non-empty one, a file, or a read-only mount", () => {
  const yafs = new Yafs();
  yafs.exec("mkdir empty");
  yafs.exec("mkdir full");
  yafs.exec("touch full/inside");
  expect(yafs.exec("rmdir empty")).toBe("");
  expect(yafs.execute("cat empty").error?.code).toBe("not_found");
  expect(yafs.execute("rmdir full").error?.code).toBe("not_empty");
  expect(yafs.execute("rmdir full/inside").error?.code).toBe("not_directory");
  expect(yafs.execute("rmdir missing").error?.code).toBe("not_found");
  yafs.store.write("/home/root/.yafsmeta", fixtureManifest());
  yafs.exec("plugin activate .yafsmeta");
  expect(yafs.execute("rmdir fixture").error?.code).toBe("read_only_mount");
});

function fixtureManifest() {
  return "{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}]}";
}

test("read-only text commands query virtual files without host processes", () => {
  const yafs = new Yafs();
  yafs.store.write("/home/root/words", "alpha\nbeta\nalphabet");
  expect(yafs.exec("grep -n alpha words")).toBe("1:alpha\n3:alphabet");
  expect(yafs.exec("head -n 2 words")).toBe("alpha\nbeta");
  expect(yafs.exec("tail -n 1 words")).toBe("alphabet");
  expect(yafs.exec("wc -l words")).toBe("3");
  expect(yafs.exec("grep beta words")).toBe("beta");
  expect(yafs.execute("head words").stderr).toContain(
    "head requires -n COUNT PATH",
  );
  expect(yafs.execute("grep alpha").stderr).toContain(
    "grep requires a pattern and path",
  );
});

function commandContext(): CommandContext {
  const resolve = (path: string) => `/home/root/${path}` as const;
  return {
    clock: { now: () => new Date(0) },
    user: () => "root",
    pwd: () => "/home/root",
    cd: () => undefined,
    resolve,
    required: (_command, args, index) => args[index] || "",
    help: () => "",
    read: () => "",
    readlink: () => "",
    list: () => [],
    type: () => "file",
    origins: () => [],
    provenance: () => [],
    mounts: () => [],
    plugins: () => [],
    ...mountContext(),
    ...writeContext(),
  };
}

function mountContext() {
  return {
    planMount: () => {
      throw new Error();
    },
    prepareMount: () => {
      throw new Error();
    },
    planRefresh: () => {
      throw new Error();
    },
    planUnmount: () => {
      throw new Error();
    },
    mount: () => undefined,
    refresh: () => undefined,
    unmount: () => undefined,
    resourceReference: () => undefined,
    desiredStatus: async () => ({}),
    desiredPlan: async () => [],
    applyDesired: async () => [],
    refreshDesired: async () => ({}),
    agentPersona: () => {
      throw new Error();
    },
    slackPlugin: () => {
      throw new Error();
    },
  };
}

function writeContext() {
  const blobs = memoryBlobStore();
  return {
    exists: () => false,
    traces: new TraceService(blobs),
    cache: new CacheService(blobs),
    mkdir: () => undefined,
    afterCommit: () => undefined,
    touch: () => undefined,
    write: () => undefined,
    remove: () => undefined,
    rmdir: () => undefined,
    symlink: () => undefined,
    union: () => undefined,
  };
}
