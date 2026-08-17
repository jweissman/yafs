import { AbsolutePath } from "../core/AbsolutePath";

export function manifest(path: AbsolutePath) {
  return `${path}/trace.json` as AbsolutePath;
}

export function traceOwner(path: AbsolutePath) {
  return `trace:${path}`;
}
