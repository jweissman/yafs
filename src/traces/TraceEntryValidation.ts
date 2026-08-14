import { Trace, TraceEntry } from "./TraceTypes";

export function assertEntry(entry: TraceEntry) {
  assertPath(entry.path);
  assertDigest(entry.digest);
}

export function parseTrace(content: string): Trace {
  const trace = JSON.parse(content) as Trace;
  assertManifest(trace);
  trace.entries.forEach((entry) => assertEntry(entry));
  return trace;
}

function assertManifest(trace: Trace) {
  if (
    trace.kind !== "yafs-trace" ||
    trace.version !== 1 ||
    !Array.isArray(trace.entries) ||
    !trace.capturedAt
  ) {
    throw new Error("Invalid trace manifest");
  }
}

export function assertPath(path: string) {
  if (!path || path.startsWith("/") || path.split("/").some(invalidPart)) {
    throw new Error(`Invalid trace entry path: ${path}`);
  }
}

function invalidPart(part: string) {
  return !part || part === "." || part === "..";
}

function assertDigest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Invalid trace digest");
  }
}
