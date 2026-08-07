import { createHash } from "node:crypto";

import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { Provenance } from "../mounts/types";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceEntry, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { writeEntry } from "./TraceMaterializer";
import { assertEntry } from "./TraceEntryValidation";

export type {
  TraceEntry,
  Trace,
  TraceFilesystem,
  TraceReifier,
} from "./TraceTypes";

export class TraceService {
  constructor(
    private readonly blobs: BlobStore,
    private readonly reifier?: TraceReifier,
  ) {}

  async capture(
    files: TraceFilesystem,
    source: AbsolutePath,
    origin?: Provenance,
    capturedAt = new Date().toISOString(),
  ): Promise<Trace> {
    if (files.type(source) !== "directory") {
      throw new Error("Trace source must be a directory");
    }
    const entries = await this.entries(files, source, "");
    return this.trace(source, capturedAt, origin, entries);
  }

  private trace(
    sourcePath: AbsolutePath,
    capturedAt: string,
    origin: Provenance | undefined,
    entries: TraceEntry[],
  ): Trace {
    return {
      kind: "yafs-trace",
      version: 1,
      sourcePath,
      capturedAt,
      origin,
      entries,
    };
  }

  async materialize(
    files: TraceFilesystem,
    trace: Trace,
    destination: AbsolutePath,
  ) {
    if (files.exists(destination)) {
      throw new Error(`Trace destination already exists: ${destination}`);
    }
    files.mkdir(destination);
    const target = { files, blobs: this.blobs, reifier: this.reifier };
    for (const entry of trace.entries) {
      await writeEntry(target, trace, destination, entry);
    }
  }

  retain(trace: Trace, owner: string) {
    trace.entries.forEach((entry) => this.blobs.retain(entry.digest, owner));
  }
  release(trace: Trace, owner: string) {
    trace.entries.forEach((entry) => this.blobs.release(entry.digest, owner));
  }
  gc() {
    return this.blobs.gc();
  }

  parse(content: string): Trace {
    const trace = JSON.parse(content) as Trace;
    this.assertManifest(trace);
    trace.entries.forEach((entry) => assertEntry(entry));
    return trace;
  }
  private assertManifest(trace: Trace) {
    if (
      trace.kind !== "yafs-trace" ||
      trace.version !== 1 ||
      !Array.isArray(trace.entries) ||
      !trace.capturedAt
    ) {
      throw new Error("Invalid trace manifest");
    }
  }

  private async entries(
    files: TraceFilesystem,
    path: AbsolutePath,
    relative: string,
  ): Promise<TraceEntry[]> {
    if (files.type(path) === "file") {
      return [await this.entry(files, path, relative)];
    }
    const children = await Promise.all(
      files.list(path).map((name) => this.child(files, path, relative, name)),
    );
    return children.flat();
  }
  private child(
    files: TraceFilesystem,
    path: AbsolutePath,
    relative: string,
    name: string,
  ) {
    return this.entries(
      files,
      PathResolver.resolve(name, path),
      join(relative, name),
    );
  }
  private async entry(
    files: TraceFilesystem,
    path: AbsolutePath,
    relative: string,
  ) {
    const bytes = new TextEncoder().encode(files.read(path));
    return { path: relative, digest: await this.blobs.put(bytes) };
  }
}

function join(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}
export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
