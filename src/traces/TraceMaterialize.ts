import { AbsolutePath } from "../core/AbsolutePath";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { writeEntry } from "./TraceMaterializer";

export interface MaterializeDeps {
  blobs: BlobStore;
  reifier?: TraceReifier;
}

export async function materialize(
  deps: MaterializeDeps,
  files: TraceFilesystem,
  trace: Trace,
  destination: AbsolutePath,
) {
  assertAvailable(files, destination);
  files.mkdir(destination);
  await writeEntries(deps, files, trace, destination);
}

function assertAvailable(files: TraceFilesystem, destination: AbsolutePath) {
  if (files.exists(destination)) {
    throw new Error(`Trace destination already exists: ${destination}`);
  }
}

async function writeEntries(
  deps: MaterializeDeps,
  files: TraceFilesystem,
  trace: Trace,
  destination: AbsolutePath,
) {
  const target = { files, ...deps };
  await writeEach(target, trace, destination);
}

async function writeEach(
  target: MaterializeDeps & { files: TraceFilesystem },
  trace: Trace,
  destination: AbsolutePath,
) {
  for (const entry of trace.entries) {
    await writeEntry(target, trace, destination, entry);
  }
}
