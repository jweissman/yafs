import { CommandContext } from "./commands/CommandContext";
import { Clock } from "./core/Clock";
import { AbsolutePath } from "./core/AbsolutePath";
import { MountManager } from "./mounts/MountManager";
import { YafsOperationQueue } from "./YafsOperationQueue";
import { YafsWorkspace } from "./YafsWorkspace";
import { TraceService } from "./traces/TraceService";
import { DesiredMounts } from "./mounts/DesiredMounts";
import { CacheService } from "./cache/CacheService";
import { mountContext } from "./MountContext";

type Dependencies = {
  clock: Clock;
  user: () => string;
  pwd: () => AbsolutePath;
  resolve: (path: string) => AbsolutePath;
  required: CommandContext["required"];
  help: () => string;
  workspace: YafsWorkspace;
  mounts: MountManager;
  operations: YafsOperationQueue;
  traces: TraceService;
  cache: CacheService;
  desired?: DesiredMounts;
};

export function commandContext(dependencies: Dependencies): CommandContext {
  return {
    ...session(dependencies),
    ...filesystem(dependencies),
    ...mounts(dependencies),
    ...mutations(dependencies),
    traces: dependencies.traces,
    cache: dependencies.cache,
  };
}

function session(dependencies: Dependencies) {
  return { ...identity(dependencies), ...shell(dependencies) };
}

function identity({ clock, user, pwd }: Dependencies) {
  return { clock, user, pwd };
}

function shell({ resolve, required, help, workspace }: Dependencies) {
  return { resolve, required, help, cd: (path: string) => workspace.cd(path) };
}

function filesystem({ workspace }: Dependencies) {
  return { ...reads(workspace), ...inspects(workspace) };
}

function reads(workspace: YafsWorkspace) {
  return {
    exists: (path: AbsolutePath) => workspace.exists(path),
    read: (path: AbsolutePath) => workspace.read(path),
    readlink: (path: AbsolutePath) => workspace.readlink(path),
    list: (path: AbsolutePath) => workspace.list(path),
  };
}

function inspects(workspace: YafsWorkspace) {
  return {
    type: (path: AbsolutePath, follow?: boolean) =>
      workspace.type(path, follow),
    origins: (path: AbsolutePath) => workspace.origins(path),
    provenance: (path: AbsolutePath) => workspace.provenance(path),
    mounts: () => workspace.mountLines(),
  };
}

function mounts({ mounts: manager, operations, desired }: Dependencies) {
  return mountContext(manager, operations, desired);
}

function mutations({ operations }: Dependencies) {
  return {
    ...simpleMutations(operations),
    ...afterCommit(operations),
    symlink: (target: string, path: AbsolutePath) =>
      operations.add({ type: "symlink", target, path }),
    union: (path: AbsolutePath, layers: AbsolutePath[]) =>
      union(operations, path, layers),
  };
}

function afterCommit(operations: YafsOperationQueue) {
  return {
    afterCommit: (effect: () => void) => operations.afterCommit(effect),
  };
}

function simpleMutations(operations: YafsOperationQueue) {
  return {
    ...fileMutations(operations),
    remove: (path: AbsolutePath) => operations.add({ type: "remove", path }),
    rmdir: (path: AbsolutePath) => operations.add({ type: "rmdir", path }),
  };
}

function fileMutations(operations: YafsOperationQueue) {
  return {
    mkdir: (path: AbsolutePath) => operations.add({ type: "mkdir", path }),
    touch: (path: AbsolutePath) => operations.add({ type: "touch", path }),
    write: (path: AbsolutePath, content: string) =>
      operations.add({ type: "write", path, content }),
  };
}

function union(
  operations: YafsOperationQueue,
  path: AbsolutePath,
  layers: AbsolutePath[],
) {
  if (!layers.length) {
    throw new Error("union requires at least one layer");
  }
  operations.add({ type: "union", path, layers });
}
