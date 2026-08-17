import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { ProviderOrigin } from "../vfs/FSNode";
import { NodeStore } from "../vfs/NodeStore";
import { MountRecord, PreparedMountRecord } from "./types";

export function populateSnapshot(
  store: NodeStore,
  record: PreparedMountRecord,
) {
  ensureDirectory(store, record.path);
  record.snapshot.entries.forEach((entry) => {
    write(store, record.path, entry);
  });
  store.setProviderOrigin(record.path, origin(record));
}

// A mount's default /world path is a true top-level, multi-segment path
// (/world/github/<owner>/<repo>), unlike the single-segment /home-relative
// paths every mount used before defaulting existed — a bare
// store.mkdir(record.path) throws "No such parent directory" the moment
// the immediate parent (e.g. /world/github/acme) doesn't already exist.
// Walk from the true filesystem root and create every missing ancestor
// instead, the same way write() already does for entries.
function ensureDirectory(store: NodeStore, path: AbsolutePath) {
  const segments = path.slice(1).split("/");
  const makeDir = (parent: AbsolutePath, name: string) =>
    directory(store, parent, name);
  segments.reduce<AbsolutePath>(makeDir, "/");
}

// Every entry's relative path is already validated as a safe, non-escaping
// relative path before it reaches here (see ManifestValidation.ts's
// `relative()`, enforced on fixture `files:` keys and the only source of
// caller-supplied snapshot entry paths) — no provider can hand this a path
// that resolves outside `root`, so there is nothing to guard against here.
function write(store: NodeStore, root: AbsolutePath, entry: [string, string]) {
  const [relative, content] = entry;
  const path = PathResolver.resolve(relative, root);
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
