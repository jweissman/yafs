import { AbsolutePath } from "../../core/AbsolutePath";
import { PreparedMountRecord } from "../../mounts/types";
import { mirrorPathFor } from "./GitMirrorPath";

export interface GitBacking {
  mirrorDir: string;
  sha: string;
  relativePath: string;
  mountRoot: AbsolutePath;

  paths: string[];
}

export function gitBacking(
  records: PreparedMountRecord[],
  path: AbsolutePath,
): GitBacking | undefined {
  const record = records.find((item) => isSourcePath(item, path));
  return record?.sourceRevision
    ? backingFor(record, record.sourceRevision, path)
    : undefined;
}

function isSourcePath(record: PreparedMountRecord, path: AbsolutePath) {
  const root = sourceRoot(record);
  return (
    record.provider === "github" &&
    record.capabilities.includes("host.git-read") &&
    (path === root || path.startsWith(`${root}/`))
  );
}

function sourceRoot(record: PreparedMountRecord): AbsolutePath {
  return `${record.path}/source` as AbsolutePath;
}

function backingFor(
  record: PreparedMountRecord,
  sha: string,
  path: AbsolutePath,
): GitBacking {
  const mountRoot = sourceRoot(record);
  const relativePath = relativePathFor(mountRoot, path);
  return backing(record, sha, relativePath, mountRoot);
}

function relativePathFor(mountRoot: AbsolutePath, path: AbsolutePath) {
  return path === mountRoot ? "" : path.slice(mountRoot.length + 1);
}

function backing(
  record: PreparedMountRecord,
  sha: string,
  relativePath: string,
  mountRoot: AbsolutePath,
): GitBacking {
  const mirrorDir = mirrorPathFor(record.id);
  const paths = record.sourcePaths ?? [];
  return { mirrorDir, sha, relativePath, mountRoot, paths };
}
