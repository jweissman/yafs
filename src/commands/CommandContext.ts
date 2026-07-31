import { Clock } from '../core/Clock';
import { AbsolutePath } from '../core/AbsolutePath';
import { MountRecord, Provenance } from '../mounts/types';

export type CommandContext = {
  clock: Clock;
  user(): string;
  pwd(): AbsolutePath;
  cd(path: string): void;
  resolve(path: string): AbsolutePath;
  required(command: string, args: string[], index: number): string;
  help(): string;
  read(path: AbsolutePath): string;
  readlink(path: AbsolutePath): string;
  list(path: AbsolutePath): string[];
  type(path: AbsolutePath, followFinal?: boolean): 'file' | 'directory' | 'symlink';
  origins(path: AbsolutePath): string[];
  provenance(path: AbsolutePath): Provenance[];
  mounts(): string[];
  planMount(path: AbsolutePath, id?: string): MountRecord;
  planUnmount(id: string): MountRecord;
  mkdir(path: AbsolutePath): void;
  touch(path: AbsolutePath): void;
  remove(path: AbsolutePath): void;
  symlink(target: string, path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[]): void;
  mount(record: MountRecord): void;
  unmount(id: string): void;
}
