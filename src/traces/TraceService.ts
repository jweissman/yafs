import { createHash } from "node:crypto";

import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";
import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceFilesystem, TraceReifier } from "./TraceTypes";
import { parseTrace } from "./TraceEntryValidation";
import { collectEntries } from "./TraceCapture";
import { assertEntryLimit } from "./TraceCapture";
import { materialize } from "./TraceMaterialize";

export type {
  TraceEntry,
  Trace,
  TraceFilesystem,
  TraceReifier,
} from "./TraceTypes";

export type CaptureOptions = {
  origin?: Provenance;
  capturedAt?: string;
  limit?: number;
};

function resolvedOptions(options: CaptureOptions) {
  return {
    origin: options.origin,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    limit: options.limit ?? 10000,
  };
}

export class TraceService {
  constructor(
    private readonly blobs: BlobStore,
    private readonly reifier?: TraceReifier,
  ) {}

  async capture(
    files: TraceFilesystem,
    source: AbsolutePath,
    options: CaptureOptions = {},
  ): Promise<Trace> {
    const { origin, capturedAt, limit } = resolvedOptions(options);
    this.assertCapturable(files, source, limit);
    return this.captureEntries(files, source, origin, capturedAt);
  }

  private async captureEntries(
    files: TraceFilesystem,
    source: AbsolutePath,
    origin: Provenance | undefined,
    capturedAt: string,
  ) {
    const entries = await collectEntries(this.blobs, files, source, "");
    return this.trace({ sourcePath: source, capturedAt, origin, entries });
  }

  private assertDirectory(files: TraceFilesystem, source: AbsolutePath) {
    if (files.type(source) !== "directory") {
      throw new Error("Trace source must be a directory");
    }
  }

  private assertCapturable(
    files: TraceFilesystem,
    source: AbsolutePath,
    limit: number,
  ) {
    this.assertDirectory(files, source);
    assertEntryLimit(files, source, limit);
  }

  private trace(fields: Omit<Trace, "kind" | "version">): Trace {
    return { kind: "yafs-trace", version: 1, ...fields };
  }

  materialize(files: TraceFilesystem, trace: Trace, destination: AbsolutePath) {
    const deps = { blobs: this.blobs, reifier: this.reifier };
    return materialize(deps, files, trace, destination);
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
    return parseTrace(content);
  }
}

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
