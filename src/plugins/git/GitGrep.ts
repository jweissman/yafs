import { GitResult, RunGit } from "./GitProcess";

export interface GitGrepMatch {
  path: string;
  line: number;
  text: string;
}
export interface GitGrepOptions {
  ignoreCase?: boolean;
  invert?: boolean;
}
export interface GitGrepTarget {
  mirrorDir: string;
  sha: string;
  relativePath?: string;
}

export async function grep(
  runGit: RunGit,
  target: GitGrepTarget,
  pattern: string,
  options: GitGrepOptions = {},
): Promise<GitGrepMatch[]> {
  const args = grepArgs(target, pattern, options);
  const result = await runGit(args, target.mirrorDir);
  return matches(result, target.sha);
}

function grepArgs(
  target: GitGrepTarget,
  pattern: string,
  options: GitGrepOptions,
) {
  const base = ["grep", "-n", ...flagsFor(options), "-e", pattern, target.sha];
  return target.relativePath ? [...base, "--", target.relativePath] : base;
}

function flagsFor(options: GitGrepOptions): string[] {
  return [
    ...(options.ignoreCase ? ["-i"] : []),
    ...(options.invert ? ["-v"] : []),
  ];
}

function matches(result: GitResult, sha: string): GitGrepMatch[] {
  if (result.exitCode === 1 && result.stdout === "") {
    return [];
  }
  if (result.exitCode !== 0) {
    throw new Error(`git grep failed: ${result.stderr.trim()}`);
  }
  return parseMatches(result.stdout, sha);
}

function parseMatches(output: string, sha: string): GitGrepMatch[] {
  const prefix = `${sha}:`;
  return output
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => matchFrom(line, prefix));
}

function matchFrom(line: string, prefix: string): GitGrepMatch {
  const rest = line.startsWith(prefix) ? line.slice(prefix.length) : line;
  const [path, lineNumber, ...text] = rest.split(":");
  return { path, line: Number(lineNumber), text: text.join(":") };
}
