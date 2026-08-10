import { PreparedMountRecord } from "./types";

export function carryForward(
  fresh: [string, string][],
  current: PreparedMountRecord | undefined,
  owned: (path: string) => boolean,
): [string, string][] {
  const merged = new Map(fresh);
  mergeCurrent(merged, current, owned);
  return [...merged];
}

function mergeCurrent(
  merged: Map<string, string>,
  current: PreparedMountRecord | undefined,
  owned: (path: string) => boolean,
) {
  if (current) {
    applyOwned(merged, current.snapshot.entries, owned);
  }
}

function applyOwned(
  target: Map<string, string>,
  entries: [string, string][],
  owned: (path: string) => boolean,
) {
  entries
    .filter(([path]) => owned(path))
    .forEach(([path, content]) => target.set(path, content));
}
