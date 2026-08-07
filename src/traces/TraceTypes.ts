import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";

export type TraceEntry = { path: string; digest: string };
export type Trace = {
  kind: "yafs-trace";
  version: 1;
  sourcePath: string;
  capturedAt: string;
  origin?: Provenance;
  resourceReference?: object;
  entries: TraceEntry[];
};
export type TraceFilesystem = {
  exists(path: AbsolutePath): boolean;
  type(path: AbsolutePath): "file" | "directory" | "symlink";
  list(path: AbsolutePath): string[];
  read(path: AbsolutePath): string;
  mkdir(path: AbsolutePath): void;
  write(path: AbsolutePath, content: string): void;
};
export type TraceReifier = {
  reify(trace: Trace, digest: string): Promise<Uint8Array | undefined>;
};
