import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bunRunGit, RunGit } from "../../../src/plugins/git/GitProcess";
import { required } from "../../../src/plugins/git/GitProcess";

export async function realSourceRepo(runGit: RunGit) {
  const dir = await mkdtemp(join(tmpdir(), "yafs-git-source-"));
  await required(runGit, ["init", "-q", dir]);
  await required(runGit, ["config", "user.email", "test@example.com"], dir);
  await required(runGit, ["config", "user.name", "Test"], dir);
  return dir;
}

export async function commitFile(
  runGit: RunGit,
  repoDir: string,
  path: string,
  content: string,
): Promise<string> {
  await Bun.write(`${repoDir}/${path}`, content);
  await required(runGit, ["add", "-A"], repoDir);
  await required(runGit, ["commit", "-q", "-m", `add ${path}`], repoDir);
  const sha = await required(runGit, ["rev-parse", "HEAD"], repoDir);
  return sha.trim();
}

export async function mirrorDirFor(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return `${dir}/mirror.git`;
}

export function testRunGit(): RunGit {
  return bunRunGit();
}
