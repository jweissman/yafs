import { AbsolutePath } from "../../core/AbsolutePath";
import { GrepResult } from "../../operations/WorkspaceGrep";
import { GitBacking } from "./GitBacking";
import { GitGrepMatch, GitGrepOptions, grep } from "./GitGrep";
import { readFile, verify } from "./GitMirror";
import { bunRunGit, RunGit } from "./GitProcess";
import { log } from "../../Logging";

const gitLog = log.getSubLogger({ name: "git" });

export function gitRead(backing: GitBacking): Promise<string> {
  return attemptedRead(backing).catch((error: unknown) =>
    failed(backing, error),
  );
}

async function attemptedRead(backing: GitBacking) {
  const { mirrorDir, sha, relativePath } = backing;
  const runGit = bunRunGit();
  await verifyPinned(runGit, mirrorDir, sha);
  return readFile(runGit, mirrorDir, sha, relativePath);
}

export function gitGrepResult(
  backing: GitBacking,
  pattern: string,
  options: GitGrepOptions,
): Promise<GrepResult> {
  return verifiedGrep(backing, pattern, options)
    .then((matches) => resultFor(matches, backing.mountRoot))
    .catch((error: unknown) => failed(backing, error));
}

async function verifiedGrep(
  backing: GitBacking,
  pattern: string,
  options: GitGrepOptions,
) {
  const { mirrorDir, sha, relativePath } = backing;
  const runGit = bunRunGit();
  await verifyPinned(runGit, mirrorDir, sha);
  return grep(runGit, { mirrorDir, sha, relativePath }, pattern, options);
}

async function verifyPinned(runGit: RunGit, mirrorDir: string, sha: string) {
  if (!(await verify(runGit, mirrorDir, sha))) {
    throw new Error(`mirror is missing pinned commit ${sha}: run plugins refresh`);
  }
}

function failed(backing: GitBacking, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const { mirrorDir, sha } = backing;
  gitLog.error({ mirrorDir, sha, error: message }, "git read/grep failed");
  throw error;
}

function resultFor(
  matches: GitGrepMatch[],
  mountRoot: AbsolutePath,
): GrepResult {
  const absolute = matches.map((match) => absoluteMatch(match, mountRoot));
  const files = [...new Set(absolute.map((match) => match.path))];
  return { matches: absolute, count: absolute.length, truncated: false, files };
}

function absoluteMatch(match: GitGrepMatch, mountRoot: AbsolutePath) {
  return { ...match, path: `${mountRoot}/${match.path}` as AbsolutePath };
}
