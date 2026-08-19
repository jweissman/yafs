import { required, RunGit } from "./GitProcess";

export async function syncMirror(
  runGit: RunGit,
  mirrorDir: string,
  remoteUrl: string,
  authHeader?: string,
): Promise<string> {
  await ensureInitialized(runGit, mirrorDir, remoteUrl);
  await fetchDefaultBranch(runGit, mirrorDir, authHeader);
  return pinnedSha(runGit, mirrorDir);
}

async function fetchDefaultBranch(
  runGit: RunGit,
  mirrorDir: string,
  authHeader?: string,
) {
  await required(runGit, fetchArgs(authHeader), mirrorDir);
}

function fetchArgs(authHeader?: string): string[] {
  return [...authArgs(authHeader), "fetch", "--depth", "1", "origin", "HEAD"];
}

function authArgs(authHeader?: string): string[] {
  return authHeader ? ["-c", `http.extraheader=${authHeader}`] : [];
}

async function pinnedSha(runGit: RunGit, mirrorDir: string): Promise<string> {
  const sha = await required(runGit, ["rev-parse", "FETCH_HEAD"], mirrorDir);
  return sha.trim();
}

async function ensureInitialized(
  runGit: RunGit,
  mirrorDir: string,
  remoteUrl: string,
) {
  const exists = await initialized(mirrorDir);
  return exists
    ? updateRemote(runGit, mirrorDir, remoteUrl)
    : initialize(runGit, mirrorDir, remoteUrl);
}

function updateRemote(runGit: RunGit, mirrorDir: string, remoteUrl: string) {
  return required(
    runGit,
    ["remote", "set-url", "origin", remoteUrl],
    mirrorDir,
  );
}

async function initialize(
  runGit: RunGit,
  mirrorDir: string,
  remoteUrl: string,
) {
  await required(runGit, ["init", "--bare", mirrorDir]);
  await required(runGit, ["remote", "add", "origin", remoteUrl], mirrorDir);
}

async function initialized(mirrorDir: string): Promise<boolean> {
  return Bun.file(`${mirrorDir}/HEAD`).exists();
}

export async function verify(
  runGit: RunGit,
  mirrorDir: string,
  sha: string,
): Promise<boolean> {
  const result = await runGit(["cat-file", "-e", sha], mirrorDir);
  return result.exitCode === 0;
}

export async function listPaths(
  runGit: RunGit,
  mirrorDir: string,
  sha: string,
): Promise<string[]> {
  const args = ["ls-tree", "-r", "--name-only", sha];
  const output = await required(runGit, args, mirrorDir);
  return output.split("\n").filter((path) => path !== "");
}

export function readFile(
  runGit: RunGit,
  mirrorDir: string,
  sha: string,
  path: string,
): Promise<string> {
  return required(runGit, ["show", `${sha}:${path}`], mirrorDir);
}
