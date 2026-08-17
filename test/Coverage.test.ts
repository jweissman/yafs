import { expect, test } from "bun:test";
import { FixtureProvider } from "../src/plugins/fixture/FixtureProvider";
import { LocalYashClient } from "../src/protocol/local";
import { Shell } from "../src/Shell";
import { PathResolver } from "../src/core/PathResolver";
import { normalize } from "../src/core/PathResolver";
import { NodeStore } from "../src/vfs/NodeStore";
import { variable } from "../src/YafsValues";
import Yafs from "../src";

test("local client completes paths and returns no matches for missing directories", async () => {
  const client = new LocalYashClient();
  await client.exec("mkdir docs");
  await client.exec("touch docs/guide.md");
  expect(await client.complete("cat d")).toEqual(["docs"]);
  expect(await client.complete("cat missing/g")).toEqual([]);
  expect(
    (await client.writeFile("docs/guide.md", "updated")).error,
  ).toBeUndefined();
  expect(await client.exec("cat docs/guide.md")).toBe("updated");
  await client.close();
});

test("shell navigation delegates to the local node store", () => {
  const store = new NodeStore();
  const shell = new Shell({ name: "root" }, store);
  store.mkdir("/home/root/docs");
  shell.cd("docs");
  expect(shell.pwd).toBe("/home/root/docs");
  expect(() => {
    shell.cd("missing");
  }).toThrow("No such directory");
});

test("fixture providers report missing paths and enumerate configured files", () => {
  const fixture = new FixtureProvider({ "docs/guide.md": "guide" });
  expect(fixture.list("docs")).toEqual(["guide.md"]);
  expect(fixture.entries()).toEqual([["docs/guide.md", "guide"]]);
  expect(() => fixture.read("missing")).toThrow("No such file: missing");
  expect(() => fixture.type("missing")).toThrow("No such file: missing");
});

test("the composed node store façade delegates every filesystem operation", () => {
  const store = new NodeStore();
  store.mkdir("/home/root/lower");
  store.mkdir("/home/root/upper");
  expect(store.origin.name).toBe("/");
  expect(store.get("/home/root/lower", false, 0)?.dir).toBe(true);
  store.write("/home/root/lower/item", "lower");
  store.write("/home/root/upper/item", "upper");
  store.union("/home/root/view", ["/home/root/upper", "/home/root/lower"]);
  expect(store.getNode(1).name).toBe("/");
  expect(store.read("/home/root/view/item")).toBe("upper");
  store.symlink("/home/root/lower/item", "/home/root/link");
  expect(store.readlink("/home/root/link")).toContain("item");
  store.touch("/home/root/transient");
  store.remove("/home/root/transient");
  expect(store.get("/home/root/transient")).toBeUndefined();
  assertSnapshotRestoreAndReplay(store);
  expect(store.mounts()[0].path).toBe("/home/root/view");
});

function assertSnapshotRestoreAndReplay(store: NodeStore) {
  const snapshot = store.snapshot(9);
  store.removeTree("/home/root/link");
  store.restore(snapshot);
  expect(store.type("/home/root/link")).toBe("file");
  store.apply({
    type: "touch",
    path: "/home/root/restored",
    at: new Date().toISOString(),
  });
  store.validate([
    {
      type: "remove",
      path: "/home/root/restored",
      at: new Date().toISOString(),
    },
  ]);
}

test("setProviderOrigin rejects a path with no node", () => {
  const store = new NodeStore();
  expect(() => {
    store.setProviderOrigin("/home/root/missing", providerOrigin());
  }).toThrow("No such file: /home/root/missing");
});

test("provider metadata survives snapshots and protects composed paths", () => {
  const store = new NodeStore();
  store.mkdir("/home/root/provider");
  store.mkdir("/home/root/provider/nested");
  store.write("/home/root/provider/nested/item", "value");
  store.setProviderOrigin("/home/root/provider", providerOrigin());
  expect(
    store.provenance("/home/root/provider/nested/item")[0].origin?.mountId,
  ).toBe("demo");
  expect(() => {
    store.write("/home/root/provider/nested/item", "changed");
  }).toThrow("Read-only mount");
  store.mkdir("/home/root/local");
  store.union("/home/root/view", ["/home/root/local"]);
  expect(() => {
    store.write("/home/root/view/new", "blocked");
  }).toThrow("Read-only union mount");
  const snapshot = store.snapshot(1);
  const restored = new NodeStore();
  restored.restore(snapshot);
  expect(() => {
    restored.write("/home/root/provider/nested/item", "changed");
  }).toThrow("Read-only mount");
});

test("path helpers resolve and normalize absolute paths", () => {
  expect(PathResolver.home({ name: "alice" })).toBe("/home/alice");
  expect(normalize("/home/./root/../alice")).toEqual(["home", "alice"]);
  expect(PathResolver.resolve("../docs/./guide", "/home/root/work")).toBe(
    "/home/root/docs/guide",
  );
  expect(PathResolver.resolve("/", "/home/root")).toBe("/");
});

test("shell variables expose only explicit session state", () => {
  const yafs = new Yafs();
  expect(variable(yafs, "USER")).toBe("root");
  expect(variable(yafs, "PWD")).toBe("/home/root");
  expect(variable(yafs, "UNDECLARED")).toBe("");
});

test("arithmetic expressions may be grouped with parentheses, and substitution embeds nested output", () => {
  const yafs = new Yafs();
  expect(yafs.exec("echo $(((2+3)-1))")).toBe("4");
  expect(yafs.exec("echo hi > greeting")).toBe("");
  expect(yafs.exec("echo $(cat greeting)")).toBe("hi");
});

function providerOrigin() {
  return {
    mountId: "demo",
    provider: "fixture",
    revision: "fixture:test",
    activatedAt: "2026-01-01T00:00:00.000Z",
    readOnly: true as const,
  };
}
