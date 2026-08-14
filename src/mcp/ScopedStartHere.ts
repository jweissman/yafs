import { normalize } from "../core/PathResolver";
import {
  MountSummary,
  RootMountSummary,
  StartHereValue,
} from "../operations/WorkspaceOperation";

// Merges an agent tool session's configured roots into the unscoped
// orientation payload: which mount each root actually lives under, and a
// recommendedFirst pointing at the caller's own roots instead of a generic
// "a mounted root" — the concrete first `yafs.tree` call a scoped persona
// should make, not just proof that mounts exist somewhere.
export function scopedStartHere(
  value: StartHereValue,
  roots: string[],
): StartHereValue {
  return { ...value, ...scopedFields(value.mounts, roots) };
}

function scopedFields(mounts: MountSummary[], roots: string[]) {
  return {
    scoped: true as const,
    roots,
    mounts: intersectingMounts(mounts, roots),
    rootMounts: rootMountsFor(roots, mounts),
    recommendedFirst: recommendedFirst(roots),
  };
}

// yafs.start_here must not leak the existence of mounts a scoped session
// has no access to — only mounts that intersect at least one configured
// root belong in the response at all.
function intersectingMounts(
  mounts: MountSummary[],
  roots: string[],
): MountSummary[] {
  return mounts.filter((mount) =>
    roots.some((root) => intersects(mount.path, root)),
  );
}

function intersects(mountPath: string, root: string): boolean {
  const mountSegments = normalize(mountPath);
  const rootSegments = normalize(root);
  return (
    isPrefix(mountSegments, rootSegments) ||
    isPrefix(rootSegments, mountSegments)
  );
}

function rootMountsFor(
  roots: string[],
  mounts: MountSummary[],
): RootMountSummary[] {
  return roots.flatMap((root) => summaryFor(root, mounts));
}

function summaryFor(root: string, mounts: MountSummary[]): RootMountSummary[] {
  const mount = mountFor(root, mounts);
  return mount ? [{ root, mount: mount.path, provider: mount.provider }] : [];
}

function mountFor(
  root: string,
  mounts: MountSummary[],
): MountSummary | undefined {
  const segments = normalize(root);
  const matches = mounts.filter((mount) =>
    isPrefix(normalize(mount.path), segments),
  );
  return matches.sort((a, b) => b.path.length - a.path.length)[0];
}

function isPrefix(prefix: string[], segments: string[]): boolean {
  return prefix.every((segment, i) => segments[i] === segment);
}

function recommendedFirst(roots: string[]): string[] {
  return [
    ...roots.map((root) => `yafs.tree on ${root} (your configured root)`),
    "yafs.read on a specific file once you've found it via tree/find",
  ];
}
