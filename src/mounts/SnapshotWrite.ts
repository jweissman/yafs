import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { ProviderOrigin } from "../vfs/FSNode";
import { NodeStore } from "../vfs/NodeStore";
import { MountRecord, PreparedMountRecord } from "./types";

export function populateSnapshot(
  store: NodeStore,
  record: PreparedMountRecord,
) {
  store.mkdir(record.path);
  record.snapshot.entries.forEach((entry) => write(store, record.path, entry));
  store.setProviderOrigin(record.path, origin(record));
}

function write(store: NodeStore, root: AbsolutePath, entry: [string, string]) {
  const [relative, content] = entry;
  const path = PathResolver.resolve(relative, root);
  if (!path.startsWith(`${root}/`)) {
    throw new Error(`Invalid fixture path: ${relative}`);
  }
  parents(store, root, path);
  store.write(path, content);
}

function parents(store: NodeStore, root: AbsolutePath, path: AbsolutePath) {
  const parts = path.slice(root.length + 1).split("/");
  parts.pop();
  const makeDir = (parent: AbsolutePath, name: string) =>
    directory(store, parent, name);
  parts.reduce<AbsolutePath>(makeDir, root);
}

function directory(
  store: NodeStore,
  parent: AbsolutePath,
  name: string,
): AbsolutePath {
  const path = PathResolver.resolve(name, parent);
  return ensured(store, path);
}

function ensured(store: NodeStore, path: AbsolutePath): AbsolutePath {
  if (!store.get(path, false)) {
    store.mkdir(path);
  }
  return path;
}

function origin(record: MountRecord): ProviderOrigin {
  return {
    mountId: record.id,
    provider: record.provider,
    revision: record.revision,
    activatedAt: record.activatedAt,
    fetchedAt: record.fetchedAt,
    readOnly: true,
  };
}
