import { createHash } from "node:crypto";

import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { writeEntry } from "./TraceMaterializer";
import { assertEntry } from "./TraceEntryValidation";
import { collectEntries } from "./TraceCapture";

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
    this.assertDirectory(files, source);
    const entries = await collectEntries(this.blobs, files, source, "");
    return this.trace({ sourcePath: source, capturedAt, origin, entries });
  }

  private assertDirectory(files: TraceFilesystem, source: AbsolutePath) {
    if (files.type(source) !== "directory") {
      throw new Error("Trace source must be a directory");
    }
  }

  private trace(fields: Omit<Trace, "kind" | "version">): Trace {
    return { kind: "yafs-trace", version: 1, ...fields };
  }

  async materialize(
    files: TraceFilesystem,
    trace: Trace,
    destination: AbsolutePath,
  ) {
    this.assertAvailable(files, destination);
    files.mkdir(destination);
    await this.writeEntries(files, trace, destination);
  }

  private assertAvailable(files: TraceFilesystem, destination: AbsolutePath) {
    if (files.exists(destination)) {
      throw new Error(`Trace destination already exists: ${destination}`);
    }
  }

  private async writeEntries(
    files: TraceFilesystem,
    trace: Trace,
    destination: AbsolutePath,
  ) {
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

}

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
