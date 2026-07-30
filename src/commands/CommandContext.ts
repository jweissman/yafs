import { Clock } from '../core/Clock';
import { AbsolutePath } from '../core/AbsolutePath';
import { NodeStore } from '../vfs/NodeStore';

export type CommandContext = {
  clock: Clock;
  store: NodeStore;
  user(): string;
  pwd(): AbsolutePath;
  cd(path: string): void;
  resolve(path: string): AbsolutePath;
  required(command: string, args: string[], index: number): string;
  help(): string;
  mkdir(path: AbsolutePath): void;
  touch(path: AbsolutePath): void;
  remove(path: AbsolutePath): void;
  symlink(target: string, path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[]): void;
}
