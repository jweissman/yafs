
















import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bunRunGit, required, RunGit } from "../src/plugins/git/GitProcess";
import {
  listPaths,
  readFile,
  syncMirror,
  verify,
} from "../src/plugins/git/GitMirror";
import { grep } from "../src/plugins/git/GitGrep";

async function initRepo(runGit: RunGit, dir: string) {
  await required(runGit, ["init", "-q", dir]);
  await required(runGit, ["config", "user.email", "validate@example.com"], dir);
  await required(runGit, ["config", "user.name", "Validate"], dir);
}

async function commit(
  runGit: RunGit,
  repoDir: string,
  path: string,
  content: string,
) {
  await Bun.write(`${repoDir}/${path}`, content);
  await required(runGit, ["add", "-A"], repoDir);
  await required(runGit, ["commit", "-q", "-m", `add ${path}`], repoDir);
}

function expect(label: string, actual: unknown, expected: unknown) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  const line = `expected: ${JSON.stringify(expected)}\n  received: ${JSON.stringify(actual)}`;
  if (!same) {
    throw new Error(`${label}\n  ${line}`);
  }
  console.log(`  ok  ${label}`);
}

async function main(work: string) {
  const runGit = bunRunGit();
  const source = join(work, "source");
  const mirrorDir = join(work, "mirror.git");
  await initRepo(runGit, source);

  console.log(`synthetic source repo: ${source}`);
  console.log(
    `mirror dir (matches the real <tmpdir>/yafs-git-mirrors/<mountId> layout): ${mirrorDir}\n`,
  );

  console.log("first sync (no auth header -- local remotes need none):");
  await commit(runGit, source, "hello.txt", "hello world");
  const sha1 = await syncMirror(runGit, mirrorDir, source);
  const paths1 = await listPaths(runGit, mirrorDir, sha1);
  const read1 = await readFile(runGit, mirrorDir, sha1, "hello.txt");
  const goodVerify = await verify(runGit, mirrorDir, sha1);
  const badVerify = await verify(runGit, mirrorDir, "0".repeat(40));
  const grep1 = await grep(runGit, { mirrorDir, sha: sha1 }, "hello");
  expect("pinned sha looks like a real sha", /^[0-9a-f]{40}$/.test(sha1), true);
  expect("listPaths sees hello.txt", paths1, ["hello.txt"]);
  expect("readFile returns real content", read1, "hello world");
  expect("verify confirms the pinned sha is present", goodVerify, true);
  expect("verify fails closed for an absent sha", badVerify, false);
  expect("grep finds the match", grep1.map((m) => m.path), ["hello.txt"]);

  console.log("\nsecond sync, after a new commit:");
  await commit(runGit, source, "nested/deep.txt", "needle content");
  const sha2 = await syncMirror(runGit, mirrorDir, source);
  const paths2 = (await listPaths(runGit, mirrorDir, sha2)).sort();
  const grep2 = await grep(runGit, { mirrorDir, sha: sha2 }, "needle");
  const oldRead = await readFile(runGit, mirrorDir, sha1, "hello.txt");
  const oldVerify = await verify(runGit, mirrorDir, sha1);
  expect("sha advanced", sha2 === sha1, false);
  expect("listPaths sees both files at the new sha", paths2, [
    "hello.txt",
    "nested/deep.txt",
  ]);
  expect("grep finds the new file's content", grep2.map((m) => m.path), [
    "nested/deep.txt",
  ]);
  expect("old sha is still readable (mirror keeps history)", oldRead, "hello world");
  expect("old sha still verifies", oldVerify, true);

  console.log("\ngit mirror validation passed.");
}

const keep = process.env.KEEP === "1";
const work = await mkdtemp(join(tmpdir(), "yafs-git-mirror-validation-"));
try {
  await main(work);
} catch (error) {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (keep) {
    console.log(`\nKEEP=1 set -- leaving ${work} in place. Remove it yourself when done.`);
  } else {
    await rm(work, { recursive: true, force: true });
  }
}
