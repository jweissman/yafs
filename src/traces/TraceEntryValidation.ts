import { TraceEntry } from "./TraceTypes";

export function assertEntry(entry: TraceEntry) {
  assertPath(entry.path);
  assertDigest(entry.digest);
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
