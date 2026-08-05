import { AbsolutePath } from '../core/AbsolutePath'

export const cacheRoot = '/home/root/cache' as AbsolutePath
export const cacheMetadataRoot = '/home/root/cache/metadata' as AbsolutePath

export function cacheMetadataPath(key: string) {
  return `${cacheMetadataRoot}/${encodeURIComponent(key)}.json` as AbsolutePath
}
