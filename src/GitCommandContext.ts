import { AbsolutePath } from "./core/AbsolutePath";
import { MountManager } from "./mounts/MountManager";
import { gitBacking, GitBacking } from "./plugins/git/GitBacking";
import { gitGrepResult, gitRead } from "./plugins/git/GitContext";
import { GitGrepOptions } from "./plugins/git/GitGrep";
import { gitChildren, gitType } from "./plugins/git/GitTreeSync";
import { YafsWorkspace } from "./YafsWorkspace";

export function gitLookups(manager: MountManager) {
  return {
    gitBacking: (path: AbsolutePath) => gitBacking(manager.mounts(), path),
    gitRead: (backing: GitBacking) => gitRead(backing),
    gitGrep: (backing: GitBacking, pattern: string, options: GitGrepOptions) =>
      gitGrepResult(backing, pattern, options),
  };
}

export type GitFilesystem = ReturnType<typeof gitFilesystem>;

export function gitFilesystem(manager: MountManager, workspace: YafsWorkspace) {
  return {
    type: (path: AbsolutePath, follow?: boolean) =>
      typeAt(backingFor(manager, path), workspace, path, follow),
    list: (path: AbsolutePath) =>
      listAt(backingFor(manager, path), workspace, path),
    exists: (path: AbsolutePath) =>
      existsAt(backingFor(manager, path), workspace, path),
  };
}

function backingFor(manager: MountManager, path: AbsolutePath) {
  return gitBacking(manager.mounts(), path);
}

function typeAt(
  backing: GitBacking | undefined,
  workspace: YafsWorkspace,
  path: AbsolutePath,
  follow?: boolean,
) {
  return backing
    ? gitTypeOrThrow(backing, path, "No such file")
    : workspace.type(path, follow);
}

function gitTypeOrThrow(
  backing: GitBacking,
  path: AbsolutePath,
  missing: string,
) {
  const type = gitType(backing.paths, backing.relativePath);
  return type ?? failMissing(missing, path);
}

function failMissing(missing: string, path: AbsolutePath): never {
  throw new Error(`${missing}: ${path}`);
}

function listAt(
  backing: GitBacking | undefined,
  workspace: YafsWorkspace,
  path: AbsolutePath,
) {
  return backing ? childrenOf(backing, path) : workspace.list(path);
}

function childrenOf(backing: GitBacking, path: AbsolutePath) {
  const type = gitType(backing.paths, backing.relativePath);
  if (type === undefined) {
    throw new Error(`No such directory: ${path}`);
  }
  if (type !== "directory") {
    throw new Error(`Not a directory: ${path}`);
  }
  return gitChildren(backing.paths, backing.relativePath);
}

function existsAt(
  backing: GitBacking | undefined,
  workspace: YafsWorkspace,
  path: AbsolutePath,
) {
  return backing
    ? gitType(backing.paths, backing.relativePath) !== undefined
    : workspace.exists(path);
}
