import { NodeStore } from './vfs/NodeStore';
import { PathResolver } from './core/PathResolver';
import { AbsolutePath } from './core/AbsolutePath';
import { User } from './types/User';

export class Shell {
  store: NodeStore;
  pwd: AbsolutePath;

  constructor(user: User, store: NodeStore) {
    this.store = store;
    this.pwd = PathResolver.home(user);
  }

  cd(path: string) {
    const absolutePath: AbsolutePath = PathResolver.resolve(path, this.pwd); if (!this.store.get(absolutePath)?.dir) throw new Error(`No such directory: ${absolutePath}`);
    this.pwd = absolutePath;
  }

  resolve(path: string): AbsolutePath {
    return PathResolver.resolve(path, this.pwd);
  }
}
