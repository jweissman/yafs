import { expect, test } from "bun:test";

import { gitGrepResult, gitRead } from "../../../src/plugins/git/GitContext";
import { syncMirror } from "../../../src/plugins/git/GitMirror";
import { AbsolutePath } from "../../../src/core/AbsolutePath";
import {
  commitFile,
  mirrorDirFor,
  realSourceRepo,
  testRunGit,
} from "./git_fixture_helpers";

async function pinnedBacking(prefix: string) {
  const runGit = testRunGit();
  const source = await realSourceRepo(runGit);
  await commitFile(runGit, source, "lib/greeting.rb", "def hello\nend\n");
  const sha = await commitFile(runGit, source, "notes.txt", "hi there");
  const mirrorDir = await mirrorDirFor(prefix);
  await syncMirror(runGit, mirrorDir, `file://${source}`);
  const mountRoot = "/world/github/acme/widget/source" as AbsolutePath;
  const paths = ["lib/greeting.rb", "notes.txt"];
  return { mirrorDir, sha, mountRoot, paths };
}

test("gitRead fetches one file's real content through the backing", async () => {
  const { mirrorDir, sha, mountRoot, paths } =
    await pinnedBacking("yafs-git-ctx-read-");

  const content = await gitRead({
    mirrorDir,
    sha,
    relativePath: "notes.txt",
    mountRoot,
    paths,
  });

  expect(content).toBe("hi there");
});

test("gitGrepResult converts real matches into absolute, mount-rooted paths", async () => {
  const { mirrorDir, sha, mountRoot, paths } =
    await pinnedBacking("yafs-git-ctx-grep-");

  const result = await gitGrepResult(
    { mirrorDir, sha, relativePath: "", mountRoot, paths },
    "hello",
    {},
  );

  expect(result).toEqual({
    matches: [
      {
        path: "/world/github/acme/widget/source/lib/greeting.rb",
        line: 1,
        text: "def hello",
      },
    ],
    count: 1,
    truncated: false,
    files: ["/world/github/acme/widget/source/lib/greeting.rb"],
  });
});

test("gitGrepResult respects options like ignoreCase, passed through to real git", async () => {
  const { mirrorDir, sha, mountRoot, paths } =
    await pinnedBacking("yafs-git-ctx-ci-");

  const result = await gitGrepResult(
    { mirrorDir, sha, relativePath: "", mountRoot, paths },
    "HELLO",
    { ignoreCase: true },
  );

  expect(result.count).toBe(1);
});

test("gitRead fails closed with a clear message when the pinned sha is missing", async () => {
  const { mirrorDir, mountRoot, paths } = await pinnedBacking(
    "yafs-git-ctx-missing-",
  );
  const missingSha = "0".repeat(40);

  await expect(
    gitRead({ mirrorDir, sha: missingSha, relativePath: "notes.txt", mountRoot, paths }),
  ).rejects.toThrow(`mirror is missing pinned commit ${missingSha}`);
});

test("gitGrepResult fails closed with a clear message when the pinned sha is missing", async () => {
  const { mirrorDir, mountRoot, paths } = await pinnedBacking(
    "yafs-git-ctx-grep-missing-",
  );
  const missingSha = "0".repeat(40);

  await expect(
    gitGrepResult(
      { mirrorDir, sha: missingSha, relativePath: "", mountRoot, paths },
      "hello",
      {},
    ),
  ).rejects.toThrow(`mirror is missing pinned commit ${missingSha}`);
});
