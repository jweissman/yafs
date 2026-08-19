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
import { mutationContext } from "./YafsMutationContext";
import { gitFilesystem, GitFilesystem } from "./GitCommandContext";

interface Dependencies {
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
  runProgram: CommandContext["runProgram"];
}

export function commandContext(dependencies: Dependencies): CommandContext {
  return {
    ...session(dependencies),
    ...filesystem(dependencies),
    ...mounts(dependencies),
    ...mutations(dependencies),
    ...services(dependencies),
  };
}

function services(dependencies: Dependencies) {
  const { traces, cache, runProgram } = dependencies;
  return { traces, cache, runProgram };
}

function session(dependencies: Dependencies) {
  return { ...identity(dependencies), ...shell(dependencies) };
}

function identity({ clock, user, pwd }: Dependencies) {
  return { clock, user, pwd };
}

function shell({ resolve, required, help, workspace, mounts }: Dependencies) {
  return {
    resolve,
    required,
    help,
    cd: (path: string) => {
      cd(workspace, gitFilesystem(mounts, workspace).type, resolve(path));
    },
  };
}

function cd(
  workspace: YafsWorkspace,
  type: GitFilesystem["type"],
  absolute: AbsolutePath,
) {
  if (type(absolute, true) !== "directory") {
    throw new Error(`No such directory: ${absolute}`);
  }
  workspace.enter(absolute);
}

function filesystem({ workspace, mounts }: Dependencies) {
  const git = gitFilesystem(mounts, workspace);
  return { ...reads(workspace, git), ...inspects(workspace, git) };
}

function reads(workspace: YafsWorkspace, git: GitFilesystem) {
  return {
    exists: git.exists,
    read: (path: AbsolutePath) => workspace.read(path),
    readlink: (path: AbsolutePath) => workspace.readlink(path),
    list: git.list,
  };
}

function inspects(workspace: YafsWorkspace, git: GitFilesystem) {
  return {
    type: git.type,
    origins: (path: AbsolutePath) => workspace.origins(path),
    provenance: (path: AbsolutePath) => workspace.provenance(path),
    mounts: () => workspace.mountLines(),
    mountSummaries: () => workspace.mountSummaries(),
  };
}

function mounts({ mounts: manager, operations, desired }: Dependencies) {
  return mountContext(manager, operations, desired);
}

function mutations({ operations }: Dependencies) {
  return mutationContext(operations);
}
