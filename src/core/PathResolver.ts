import { AbsolutePath } from './AbsolutePath';
import { User } from '../types/User';

export function normalize(path: string): string[] {
  return path.split('/').reduce<string[]>((resolved, segment) => {
    if (!segment || segment === '.') return resolved;
    return segment === '..' ? resolved.slice(0, -1) : [...resolved, segment];
  }, []);
}

export class PathResolver {
  static home(user: User): AbsolutePath {
    return `/home/${user.name}` as AbsolutePath;
  }

  static resolve(path: string, current: AbsolutePath): AbsolutePath {
    return `/${normalize(path.startsWith('/') ? path : `${current}/${path}`).join('/')}` as AbsolutePath;
  }
}
