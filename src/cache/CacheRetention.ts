import { NodeStore } from "../vfs/NodeStore";
import { cacheMetadataRoot } from "./CachePaths";
import { CacheService } from "./CacheService";

export function retainCaches(
  store: NodeStore,
  cache: CacheService,
  now = new Date(),
) {
  if (!store.get(cacheMetadataRoot, false)) {
    return;
  }
  store
    .list(cacheMetadataRoot)
    .forEach((name) => retain(store, cache, name, now));
}

function retain(
  store: NodeStore,
  cache: CacheService,
  name: string,
  now: Date,
) {
  const path = entryPath(name);
  const entry = cache.parse(store.read(path));
  if (!cache.expired(entry, now)) {
    cache.retain(entry);
  }
}

function entryPath(name: string) {
  return `${cacheMetadataRoot}/${name}` as import("../core/AbsolutePath").AbsolutePath;
}
