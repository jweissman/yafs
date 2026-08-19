import { expect, test } from "bun:test";

import Yafs from "../../../src";
import { NodeStore } from "../../../src/vfs/NodeStore";
import { MountManager } from "../../../src/mounts/MountManager";
import { AbsolutePath } from "../../../src/core/AbsolutePath";
import { PreparedMountRecord } from "../../../src/mounts/types";
import { mirrorPathFor } from "../../../src/plugins/git/GitMirrorPath";
import { syncMirror } from "../../../src/plugins/git/GitMirror";
import {
  commitFile,
  realSourceRepo,
  testRunGit,
} from "../git/git_fixture_helpers";
import { sourceMarker } from "../../../src/plugins/github/GitHubFetchedRecord";

async function scopingMountedYafs() {
  const runGit = testRunGit();
  const sourceRepo = await realSourceRepo(runGit);
  await commitFile(runGit, sourceRepo, "lib/greeting.rb", "def hello\nend\n");
  await commitFile(runGit, sourceRepo, "notes.txt", "hi there");
  const sha = await commitFile(runGit, sourceRepo, "outside.txt", "hello!");

  const mountId = "review-source-e2e";
  await syncMirror(runGit, mirrorPathFor(mountId), `file://${sourceRepo}`);

  const store = new NodeStore();
  const mounts = new MountManager(store);
  mounts.activate(record(mountId, sha), "test");
  return new Yafs({ store, mounts });
}

test("cat and grep work with ordinary syntax over a real github mount's granted source/ subtree", async () => {
  const yafs = await scopingMountedYafs();

  const cat = await yafs.executeAsync(
    "cat /world/github/acme/widget/source/notes.txt",
  );
  expect(cat.error).toBeUndefined();
  expect(cat.stdout).toBe("hi there");

  const found = await yafs.executeAsync(
    "grep -n hello /world/github/acme/widget/source",
  );
  expect(found.error).toBeUndefined();
  expect(found.stdout.split("\n").sort()).toEqual([
    "1:def hello",
    "1:hello!",
  ]);

  const empty = await yafs.executeAsync(
    "grep nomatch /world/github/acme/widget/source",
  );
  expect(empty.error).toBeUndefined();
  expect(empty.stdout).toBe("");
});

test("grep scoped to a subdirectory only matches within it", async () => {
  const yafs = await scopingMountedYafs();

  const scopedToLib = await yafs.executeAsync(
    "grep -n hello /world/github/acme/widget/source/lib",
  );
  expect(scopedToLib.error).toBeUndefined();
  expect(scopedToLib.stdout).toBe("1:def hello");

  const files = await yafs.executeAsync(
    "grep -l hello /world/github/acme/widget/source",
  );
  expect(files.error).toBeUndefined();
  expect(files.stdout.split("\n").sort()).toEqual([
    "/world/github/acme/widget/source/lib/greeting.rb",
    "/world/github/acme/widget/source/outside.txt",
  ]);
});

async function mcpMountedYafs(mountId: string) {
  const runGit = testRunGit();
  const sourceRepo = await realSourceRepo(runGit);
  await commitFile(runGit, sourceRepo, "lib/greeting.rb", "def hello\nend\n");
  const sha = await commitFile(runGit, sourceRepo, "notes.txt", "hi there");
  await syncMirror(runGit, mirrorPathFor(mountId), `file://${sourceRepo}`);

  const store = new NodeStore();
  const mounts = new MountManager(store);
  mounts.activate(record(mountId, sha), "test");
  return new Yafs({ store, mounts });
}

test("MCP-style read returns real content over source/, not an empty placeholder", async () => {
  const yafs = await mcpMountedYafs("review-mcp-read-e2e");

  const read = await yafs.planOperationAsync({
    name: "read",
    path: "/world/github/acme/widget/source/notes.txt",
  });

  expect(read.result.error).toBeUndefined();
  expect(read.result.value).toEqual({
    kind: "read",
    path: "/world/github/acme/widget/source/notes.txt",
    text: "hi there",
  });
});

test("MCP-style grep returns real matches over source/, not none", async () => {
  const yafs = await mcpMountedYafs("review-mcp-grep-e2e");

  const found = await yafs.planOperationAsync({
    name: "grep",
    pattern: "hello",
    paths: ["/world/github/acme/widget/source"],
  });

  expect(found.result.error).toBeUndefined();
  expect(found.result.value).toMatchObject({
    kind: "grep",
    count: 1,
    matches: [
      {
        path: "/world/github/acme/widget/source/lib/greeting.rb",
        line: 1,
        text: "def hello",
      },
    ],
  });
});

test("MCP-style grep across multiple paths doesn't count as git-backed", async () => {
  const yafs = await mcpMountedYafs("review-mcp-multi-e2e");

  const multiPath = await yafs.planOperationAsync({
    name: "grep",
    pattern: "hello",
    paths: [
      "/world/github/acme/widget/source",
      "/world/github/acme/widget/source/lib",
    ],
  });

  expect(multiPath.result.error).toBeDefined();
});

test("a failing MCP-style read over source/ surfaces as a normal error result", async () => {
  const store = new NodeStore();
  const mounts = new MountManager(store);
  mounts.activate(record("review-fail-e2e", "deadbeef", ["notes.txt"]), "test");
  const yafs = new Yafs({ store, mounts });

  const read = await yafs.planOperationAsync({
    name: "read",
    path: "/world/github/acme/widget/source/notes.txt",
  });

  expect(read.result.error).toBeDefined();
});

test("source/ shows up under the mount root, and ls/cd/test work over it with only one published entry", async () => {
  const runGit = testRunGit();
  const sourceRepo = await realSourceRepo(runGit);
  await commitFile(runGit, sourceRepo, "lib/greeting.rb", "def hello\nend\n");
  const sha = await commitFile(runGit, sourceRepo, "notes.txt", "hi there");

  const mountId = "review-ls-e2e";
  await syncMirror(runGit, mirrorPathFor(mountId), `file://${sourceRepo}`);

  const store = new NodeStore();
  const mounts = new MountManager(store);
  const prepared = record(mountId, sha);
  mounts.activate(prepared, "test");
  const yafs = new Yafs({ store, mounts });

  expect(prepared.snapshot.entries).toEqual([["source/.git-source", ""]]);
  expect(yafs.exec("ls /world/github/acme/widget")).toContain("source");
  expect(
    yafs.exec("ls /world/github/acme/widget/source").split("\n").sort(),
  ).toEqual(["lib", "notes.txt"]);
  expect(yafs.exec("ls /world/github/acme/widget/source/lib")).toBe(
    "greeting.rb",
  );
  expect(yafs.exec("test -e /world/github/acme/widget/source/notes.txt")).toBe(
    "true",
  );
  expect(yafs.exec("test -d /world/github/acme/widget/source/lib")).toBe(
    "true",
  );
  yafs.exec("cd /world/github/acme/widget/source/lib");
  expect(yafs.exec("pwd")).toBe("/world/github/acme/widget/source/lib");
});

test("a mount with well over 4096 files activates and browses fine", () => {
  const sourcePaths = Array.from(
    { length: 6000 },
    (_, i) => `pkg${String(i % 100)}/file${String(i)}.rb`,
  );

  const store = new NodeStore();
  const mounts = new MountManager(store);
  const prepared = record("review-scale-e2e", "deadbeef", sourcePaths);
  mounts.activate(prepared, "test");
  const yafs = new Yafs({ store, mounts });

  expect(prepared.snapshot.entries).toEqual([["source/.git-source", ""]]);
  expect(yafs.exec("ls /world/github/acme/widget")).toContain("source");
  expect(
    yafs.exec("ls /world/github/acme/widget/source").split("\n"),
  ).toHaveLength(100);
  expect(
    yafs.exec("ls /world/github/acme/widget/source/pkg0").split("\n"),
  ).toHaveLength(60);
  expect(
    yafs.exec("test -e /world/github/acme/widget/source/pkg0/file0.rb"),
  ).toBe("true");
});

test("type/list report a clear not-found error for a nonexistent source/ path", () => {
  const store = new NodeStore();
  const mounts = new MountManager(store);
  mounts.activate(record("review-notfound-e2e", "deadbeef", ["a.txt"]), "test");
  const yafs = new Yafs({ store, mounts });

  expect(yafs.exec("test -f /world/github/acme/widget/source/missing.rb")).toBe(
    "false",
  );
  const listing = yafs.execute("ls /world/github/acme/widget/source/missing");
  expect(listing.error?.code).toBe("not_found");

  const notADir = yafs.execute("ls /world/github/acme/widget/source/a.txt");
  expect(notADir.error?.code).toBe("not_directory");
});

test("cat/grep against pulls/ and commits/ on the same mount stay ordinary VFS reads", async () => {
  const runGit = testRunGit();
  const sourceRepo = await realSourceRepo(runGit);
  const sha = await commitFile(runGit, sourceRepo, "a.txt", "a");
  const mountId = "review-mixed-e2e";
  await syncMirror(runGit, mirrorPathFor(mountId), `file://${sourceRepo}`);

  const store = new NodeStore();
  const mounts = new MountManager(store);
  const prepared = record(mountId, sha);
  prepared.snapshot.entries = [["pulls/1/metadata.json", '{"number":1}']];
  mounts.activate(prepared, "test");
  const yafs = new Yafs({ store, mounts });

  expect(yafs.exec("cat /world/github/acme/widget/pulls/1/metadata.json")).toBe(
    '{"number":1}',
  );
});

function record(
  id: string,
  sha: string,
  sourcePaths = ["lib/greeting.rb", "notes.txt"],
): PreparedMountRecord {
  const path = "/world/github/acme/widget" as AbsolutePath;
  const entries = sourceMarker({ sha });
  return {
    id,
    path,
    provider: "github",
    config: { repository: "acme/widget" },
    manifestPath: "/dev/null",
    manifestDigest: "digest",
    revision: "rev-1",
    state: "active",
    activatedAt: new Date().toISOString(),
    correlationId: "corr-1",
    capabilities: ["network.github-api", "host.git-read"],
    sourceRevision: sha,
    sourcePaths,
    snapshot: { entries, fileCount: entries.length, byteCount: 0 },
  };
}
