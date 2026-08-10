import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { BlobStore } from "../protocol/BlobStore";
import { TraceEntry, TraceFilesystem } from "./TraceTypes";

type Source = { blobs: BlobStore; files: TraceFilesystem };

export async function collectEntries(
  blobs: BlobStore,
  files: TraceFilesystem,
  path: AbsolutePath,
  relative: string,
): Promise<TraceEntry[]> {
  return entriesAt({ blobs, files }, path, relative);
}

async function entriesAt(
  source: Source,
  path: AbsolutePath,
  relative: string,
): Promise<TraceEntry[]> {
  if (source.files.type(path) === "file") {
    return [await entryAt(source, path, relative)];
  }
  return directoryEntries(source, path, relative);
}

async function directoryEntries(
  source: Source,
  path: AbsolutePath,
  relative: string,
): Promise<TraceEntry[]> {
  const names = source.files.list(path);
  const childLists = names.map((name) => child(source, path, relative, name));
  return (await Promise.all(childLists)).flat();
}

function child(
  source: Source,
  path: AbsolutePath,
  relative: string,
  name: string,
) {
  const childPath = PathResolver.resolve(name, path);
  return entriesAt(source, childPath, join(relative, name));
}

async function entryAt(source: Source, path: AbsolutePath, relative: string) {
  const bytes = new TextEncoder().encode(source.files.read(path));
  return { path: relative, digest: await source.blobs.put(bytes) };
}

function join(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}
