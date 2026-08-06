import { PreparedMountRecord } from './types'

export function carryForward(fresh: [string, string][], current: PreparedMountRecord | undefined,
  owned: (path: string) => boolean): [string, string][] {
  if (!current) return fresh
  const merged = new Map(fresh); applyOwned(merged, current.snapshot.entries, owned); return [...merged]
}

function applyOwned(target: Map<string, string>, entries: [string, string][], owned: (path: string) => boolean) {
  entries.filter(([path]) => owned(path)).forEach(([path, content]) => target.set(path, content))
}
