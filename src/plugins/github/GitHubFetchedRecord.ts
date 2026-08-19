import { MountRecord } from "../../mounts/types";
import { ProviderSnapshot } from "./GitHubCollectionSource";

export interface MirrorResult {
  sha?: string;
  paths?: string[];
}

export function emptySnapshot(): ProviderSnapshot {
  return {
    entries: [],
    revision: "github:none",
    fetchedAt: new Date().toISOString(),
    resourceReferences: {},
  };
}

export function fetchedRecord(
  record: MountRecord,
  snapshot: ProviderSnapshot,
  mirrored: MirrorResult,
) {
  return { ...record, ...fetched(snapshot), ...sourced(mirrored) };
}

function fetched(snapshot: ProviderSnapshot) {
  return { revision: snapshot.revision, fetchedAt: snapshot.fetchedAt };
}

function sourced(mirrored: MirrorResult) {
  return { sourceRevision: mirrored.sha, sourcePaths: mirrored.paths };
}

export function sourceMarker(mirrored: MirrorResult): [string, string][] {
  return mirrored.sha ? [["source/.git-source", ""]] : [];
}
