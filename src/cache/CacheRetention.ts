import { NodeStore } from "../vfs/NodeStore";
import { cacheMetadataRoot } from "./CachePaths";
import { CacheService } from "./CacheService";

interface Retention {
  store: NodeStore;
  cache: CacheService;
}

export function retainCaches(deps: Retention, now = new Date()) {
  if (!deps.store.get(cacheMetadataRoot, false)) {
    return;
  }
  const names = deps.store.list(cacheMetadataRoot);
  names.forEach((name) => {
    retain(deps, name, now);
  });
}

function retain(deps: Retention, name: string, now: Date) {
  const entry = readEntry(deps, name);
  if (!deps.cache.expired(entry, now)) {
    deps.cache.retain(entry);
  }
}

function readEntry(deps: Retention, name: string) {
  return deps.cache.parse(deps.store.read(entryPath(name)));
}

function entryPath(name: string) {
  return `${cacheMetadataRoot}/${name}` as import("../core/AbsolutePath").AbsolutePath;
}
