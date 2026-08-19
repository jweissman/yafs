import { expect, test } from "bun:test";

import {
  listPaths,
  readFile,
  syncMirror,
  verify,
} from "../../../src/plugins/git/GitMirror";
import {
  commitFile,
  mirrorDirFor,
  realSourceRepo,
  testRunGit,
} from "./git_fixture_helpers";

test("syncMirror clones a fresh mirror and pins the source's current commit", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  const sha = await commitFile(runGit, source, "README.md", "hello");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-fresh-");

  const pinned = await syncMirror(runGit, mirrorDir, `file://${source}`);

  expect(pinned).toBe(sha);
});

test("syncMirror is idempotent and picks up a new commit on a second call", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "a.txt", "one");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-idempotent-");
  const first = await syncMirror(runGit, mirrorDir, `file://${source}`);

  const second = await commitFile(runGit, source, "b.txt", "two");
  const resynced = await syncMirror(runGit, mirrorDir, `file://${source}`);

  expect(resynced).toBe(second);
  expect(resynced).not.toBe(first);
});

test("verify confirms a pinned commit is present, and rejects one that isn't", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  const sha = await commitFile(runGit, source, "x.txt", "x");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-verify-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);

  expect(await verify(runGit, mirrorDir, sha)).toBe(true);
  expect(
    await verify(runGit, mirrorDir, "0000000000000000000000000000000000dead"),
  ).toBe(false);
});

test("listPaths returns the full real tree without fetching any content", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "lib/a.rb", "a");
  const sha = await commitFile(runGit, source, "lib/b.rb", "b");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-list-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);

  const paths = await listPaths(runGit, mirrorDir, sha);

  expect(paths.sort()).toEqual(["lib/a.rb", "lib/b.rb"]);
});

test("readFile fetches one file's real content on demand", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  const sha = await commitFile(runGit, source, "greeting.txt", "hi there");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-read-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);

  expect(await readFile(runGit, mirrorDir, sha, "greeting.txt")).toBe(
    "hi there",
  );
});

test("readFile rejects a path that doesn't exist at the pinned revision", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  const sha = await commitFile(runGit, source, "one.txt", "one");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-missing-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);

  await expect(
    readFile(runGit, mirrorDir, sha, "nonexistent.txt"),
  ).rejects.toThrow();
});

test("an auth header reaches the fetch call but is never persisted to the mirror's own config", async () => {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "one.txt", "one");
  const mirrorDir = await mirrorDirFor("yafs-git-mirror-auth-");
  const header = "AUTHORIZATION: basic dGVzdA==";
  const fetchCalls: string[][] = [];
  const recording = recordingRunGit(runGit, fetchCalls);

  await syncMirror(recording, mirrorDir, `file://${source}`, header);

  const fetchArgs = fetchCalls.find((args) => args.includes("fetch"));
  expect(fetchArgs).toContain(`http.extraheader=${header}`);
  const config = await Bun.file(`${mirrorDir}/config`).text();
  expect(config).not.toContain(header);
  expect(config).not.toContain("dGVzdA==");
});

function recordingRunGit(
  runGit: ReturnType<typeof testRunGit>,
  calls: string[][],
) {
  return (args: string[], cwd?: string) => {
    calls.push(args);
    return runGit(args, cwd);
  };
}
