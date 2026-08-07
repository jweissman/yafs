import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceEntry, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { assertEntry, assertPath } from "./TraceEntryValidation";

type Materializer = {
  files: TraceFilesystem;
  blobs: BlobStore;
  reifier?: TraceReifier;
};

export async function writeEntry(
  target: Materializer,
  trace: Trace,
  destination: AbsolutePath,
  entry: TraceEntry,
) {
  assertEntry(entry);
  const path = resolveDestination(destination, entry.path);
  const bytes = await bytesFor(target, trace, entry.digest);
  ensureParents(target.files, destination, path);
  target.files.write(path, new TextDecoder().decode(bytes));
}

async function bytesFor(target: Materializer, trace: Trace, digest: string) {
  return (await target.blobs.get(digest)) || recover(target, trace, digest);
}

async function recover(target: Materializer, trace: Trace, digest: string) {
  if (!trace.resourceReference || !target.reifier) {
    throw new Error(`Missing trace blob: ${digest}`);
  }
  const bytes = await recoverBytes(target.reifier, trace, digest);
  return saveRecovered(target.blobs, bytes, digest);
}

async function saveRecovered(
  blobs: BlobStore,
  bytes: Uint8Array,
  digest: string,
) {
  assertRecoveredDigest(await blobs.put(bytes), digest);
  return bytes;
}

async function recoverBytes(
  reifier: TraceReifier,
  trace: Trace,
  digest: string,
) {
  const bytes = await reifier.reify(trace, digest);
  if (!bytes) {
    throw new Error(`Missing trace blob: ${digest}`);
  }
  return bytes;
}

function assertRecoveredDigest(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Trace reifier returned wrong content: ${expected}`);
  }
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
  if (!files.exists(path)) {
    files.mkdir(path);
  }
  return path;
}
