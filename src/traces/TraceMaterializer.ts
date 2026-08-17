import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceEntry, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { assertEntry, assertPath } from "./TraceEntryValidation";
import { bytesFor } from "./TraceBlobRecovery";

interface Materializer {
  files: TraceFilesystem;
  blobs: BlobStore;
  reifier?: TraceReifier;
}

export async function writeEntry(
  target: Materializer,
  trace: Trace,
  destination: AbsolutePath,
  entry: TraceEntry,
) {
  assertEntry(entry);
  await finishWrite(target, trace, destination, entry);
}

async function finishWrite(
  target: Materializer,
  trace: Trace,
  destination: AbsolutePath,
  entry: TraceEntry,
) {
  const path = resolveDestination(destination, entry.path);
  const bytes = await bytesFor(target, trace, entry.digest);
  writeMaterialized(target.files, destination, path, bytes);
}

function writeMaterialized(
  files: TraceFilesystem,
  destination: AbsolutePath,
  path: AbsolutePath,
  bytes: Uint8Array,
) {
  ensureParents(files, destination, path);
  files.write(path, new TextDecoder().decode(bytes));
}

function resolveDestination(destination: AbsolutePath, relative: string) {
  assertPath(relative);
  return PathResolver.resolve(relative, destination);
}

function ensureParents(
  files: TraceFilesystem,
  root: AbsolutePath,
  path: AbsolutePath,
) {
  const reducer = (parent: AbsolutePath, name: string) =>
    ensureParent(files, parent, name);
  parentSegments(root, path).reduce(reducer, root);
}

function parentSegments(root: AbsolutePath, path: AbsolutePath) {
  return path
    .slice(root.length + 1)
    .split("/")
    .slice(0, -1);
}

function ensureParent(
  files: TraceFilesystem,
  parent: AbsolutePath,
  name: string,
) {
  const path = PathResolver.resolve(name, parent);
  return mkdirIfMissing(files, path);
}

function mkdirIfMissing(files: TraceFilesystem, path: AbsolutePath) {
  if (!files.exists(path)) {
    files.mkdir(path);
  }
  return path;
}
