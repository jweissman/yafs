import { expect, test } from "bun:test";

import { grep } from "../../../src/plugins/git/GitGrep";
import { syncMirror } from "../../../src/plugins/git/GitMirror";
import { RunGit } from "../../../src/plugins/git/GitProcess";
import {
  commitFile,
  mirrorDirFor,
  realSourceRepo,
  testRunGit,
} from "./git_fixture_helpers";

async function pinnedMirror(runGit: RunGit) {
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "lib/greeting.rb", "def hello\nend\n");
  const sha = await commitFile(
    runGit,
    source,
    "lib/other.rb",
    "def unrelated\nend\n",
  );
  const mirrorDir = await mirrorDirFor("yafs-git-grep-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);
  return { mirrorDir, sha };
}

async function pinnedMirrorWithOutsideMatch(runGit: RunGit) {
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "lib/greeting.rb", "def hello\nend\n");
  const sha = await commitFile(runGit, source, "notes.txt", "hello there");
  const mirrorDir = await mirrorDirFor("yafs-git-grep-scope-");
  await syncMirror(runGit, mirrorDir, `file://${source}`);
  return { mirrorDir, sha };
}

test("grep with a relativePath only searches within that subtree", async () => {
  const runGit = testRunGit();
  const { mirrorDir, sha } = await pinnedMirrorWithOutsideMatch(runGit);

  const matches = await grep(
    runGit,
    { mirrorDir, sha, relativePath: "lib" },
    "hello",
  );

  expect(matches).toEqual([
    { path: "lib/greeting.rb", line: 1, text: "def hello" },
  ]);
});

test("grep with no relativePath (or the root) searches the whole tree", async () => {
  const runGit = testRunGit();
  const { mirrorDir, sha } = await pinnedMirrorWithOutsideMatch(runGit);

  const matches = await grep(
    runGit,
    { mirrorDir, sha, relativePath: "" },
    "hello",
  );

  expect(matches.map((match) => match.path).sort()).toEqual([
    "lib/greeting.rb",
    "notes.txt",
  ]);
});

test("grep finds real matches with path, line, and text", async () => {
  const runGit = testRunGit();
  const { mirrorDir, sha } = await pinnedMirror(runGit);

  const matches = await grep(runGit, { mirrorDir, sha }, "hello");

  expect(matches).toEqual([
    { path: "lib/greeting.rb", line: 1, text: "def hello" },
  ]);
});

test("grep returns an empty list, not an error, when nothing matches", async () => {
  const runGit = testRunGit();
  const { mirrorDir, sha } = await pinnedMirror(runGit);

  const matches = await grep(
    runGit,
    { mirrorDir, sha },
    "nothing_matches_this",
  );

  expect(matches).toEqual([]);
});

test("grep rejects a genuine git error distinctly from a no-match result", async () => {
  const runGit = testRunGit();
  const { mirrorDir } = await pinnedMirror(runGit);

  const sha = "0000000000000000000000000000000000dead";
  await expect(grep(runGit, { mirrorDir, sha }, "x")).rejects.toThrow(
    "git grep failed",
  );
});
