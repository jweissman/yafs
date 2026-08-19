import { GitHubConfig, MountRecord } from "../../mounts/types";
import { GitHubSettings } from "./GitHubSettings";
import { mirrorPathFor } from "../git/GitMirrorPath";
import { bunRunGit, RunGit } from "../git/GitProcess";
import { listPaths, syncMirror } from "../git/GitMirror";
import { gitAuthHeader, gitRemoteUrl } from "../git/GitRemoteUrl";
import { log } from "../../Logging";

const gitLog = log.getSubLogger({ name: "git" });

export interface SourceMirrorResult {
  sha: string;
  paths: string[];
}

export function syncSourceMirror(
  settings: GitHubSettings,
  record: MountRecord,
  runGit: RunGit = bunRunGit(),
) {
  const mirrorDir = mirrorPathFor(record.id);
  return mirrored(runGit, mirrorDir, settings, record)
    .then((result) => logged(record.id, mirrorDir, result))
    .catch((error: unknown) => failed(record.id, mirrorDir, error));
}

function logged(
  mountId: string,
  mirrorDir: string,
  result: SourceMirrorResult,
) {
  logSynced(mountId, mirrorDir, result.sha, result.paths.length);
  return result;
}

function failed(mountId: string, mirrorDir: string, error: unknown): never {
  logFailure(mountId, mirrorDir, error);
  throw error;
}

async function mirrored(
  runGit: RunGit,
  mirrorDir: string,
  settings: GitHubSettings,
  record: MountRecord,
): Promise<SourceMirrorResult> {
  const sha = await synced(runGit, mirrorDir, settings, record);
  const paths = await listPaths(runGit, mirrorDir, sha);
  return { sha, paths };
}

function synced(
  runGit: RunGit,
  mirrorDir: string,
  settings: GitHubSettings,
  record: MountRecord,
) {
  const { repository } = record.config as GitHubConfig;
  const remoteUrl = gitRemoteUrl(settings, repository);
  return syncMirror(runGit, mirrorDir, remoteUrl, gitAuthHeader(settings));
}

function logSynced(
  mountId: string,
  mirrorDir: string,
  sha: string,
  fileCount: number,
) {
  gitLog.info({ mountId, mirrorDir, sha, fileCount }, "mirror synced");
}

function logFailure(mountId: string, mirrorDir: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  gitLog.error({ mountId, mirrorDir, error: message }, "mirror sync failed");
}
