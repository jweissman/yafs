import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";

export interface TraceEntry {
  path: string;
  digest: string;
}
export interface Trace {
  kind: "yafs-trace";
  version: 1;
  sourcePath: string;
  capturedAt: string;
  origin?: Provenance;
  resourceReference?: object;
  entries: TraceEntry[];
}
export interface TraceFilesystem {
  exists(path: AbsolutePath): boolean;
  type(path: AbsolutePath): "file" | "directory" | "symlink";
  list(path: AbsolutePath): string[];
  read(path: AbsolutePath): string;
  mkdir(path: AbsolutePath): void;
  write(path: AbsolutePath, content: string): void;
}
export interface TraceReifier {
  reify(trace: Trace, digest: string): Promise<Uint8Array | undefined>;
}
