import { Clock } from "../core/Clock";
import { TraceService } from "../traces/TraceService";
import { AbsolutePath } from "../core/AbsolutePath";
import { MountRecord, PreparedMountRecord, Provenance } from "../mounts/types";
import { CacheService } from "../cache/CacheService";
import { MountSummary } from "../operations/WorkspaceOperation";
import { GrepResult } from "../operations/WorkspaceGrep";

export interface GitBackingInfo {
  mirrorDir: string;
  sha: string;
  relativePath: string;
  mountRoot: AbsolutePath;
  paths: string[];
}

export interface CommandContext {
  clock: Clock;
  user(): string;
  pwd(): AbsolutePath;
  cd(path: string): void;
  resolve(path: string): AbsolutePath;
  required(command: string, args: string[], index: number): string;
  help(): string;
  exists(path: AbsolutePath): boolean;
  read(path: AbsolutePath): string;
  readlink(path: AbsolutePath): string;
  list(path: AbsolutePath): string[];
  type(
    path: AbsolutePath,
    followFinal?: boolean,
  ): "file" | "directory" | "symlink";
  origins(path: AbsolutePath): string[];
  provenance(path: AbsolutePath): Provenance[];
  resourceReference(path: AbsolutePath): object | undefined;
  mounts(): string[];
  mountSummaries(): MountSummary[];
  activeMountIds(): string[];
  plugins(name?: string): object[];
  agentPersona(reference: string): AbsolutePath;
  agentPersonas(): { mountPath: string; persona: string }[];
  slackPlugin(id: string): AbsolutePath;

  gitBacking(path: AbsolutePath): GitBackingInfo | undefined;
  gitRead(backing: GitBackingInfo): Promise<string>;
  gitGrep(
    backing: GitBackingInfo,
    pattern: string,
    options: { ignoreCase?: boolean; invert?: boolean },
  ): Promise<GrepResult>;
  desiredStatus(): Promise<object>;
  desiredPlan(): Promise<object[]>;
  applyDesired(prune?: boolean): Promise<object[]>;
  refreshDesired(id: string): Promise<object>;
  planUnmount(id: string): MountRecord;
  mkdir(path: AbsolutePath): void;
  touch(path: AbsolutePath): void;
  write(path: AbsolutePath, content: string): void;
  remove(path: AbsolutePath): void;
  rmdir(path: AbsolutePath): void;
  removeTree(path: AbsolutePath): void;
  symlink(target: string, path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[]): void;
  mount(record: PreparedMountRecord): void;
  refresh(record: PreparedMountRecord): void;
  unmount(id: string, path: AbsolutePath): void;
  afterCommit(effect: () => void): void;
  runProgram(path: AbsolutePath, args: string[]): Promise<string>;
  cache: CacheService;
  traces: TraceService;
}
