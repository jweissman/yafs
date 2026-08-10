import { Clock } from "../core/Clock";
import { TraceService } from "../traces/TraceService";
import { AbsolutePath } from "../core/AbsolutePath";
import { MountRecord, PreparedMountRecord, Provenance } from "../mounts/types";
import { CacheService } from "../cache/CacheService";

export type CommandContext = {
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
  plugins(name?: string): object[];
  agentPersona(reference: string): AbsolutePath;
  agentPersonas(): { mountPath: string; persona: string }[];
  slackPlugin(id: string): AbsolutePath;
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
  symlink(target: string, path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[]): void;
  mount(record: PreparedMountRecord): void;
  refresh(record: PreparedMountRecord): void;
  unmount(id: string): void;
  afterCommit(effect: () => void): void;
  cache: CacheService;
  traces: TraceService;
};
