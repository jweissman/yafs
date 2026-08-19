import { Buffer } from "node:buffer";

import { AbsolutePath } from "../core/AbsolutePath";
import { MountRecord, PreparedMountRecord, PublishedSnapshot } from "./types";
import { NodeStore } from "../vfs/NodeStore";
import { populateSnapshot } from "./SnapshotWrite";

export interface SnapshotLimits {
  files: number;
  bytes: number;
}

export const defaultSnapshotLimits: SnapshotLimits = {
  files: 4096,
  bytes: 8 * 1024 * 1024,
};

export class SnapshotMaterializer {
  constructor(
    private readonly store: NodeStore,
    private readonly limits = defaultSnapshotLimits,
  ) {}

  prepare(
    record: MountRecord,
    entries: [string, string][],
    resourceReferences?: Record<string, object>,
  ): PreparedMountRecord {
    const snapshot = this.snapshot(entries, resourceReferences);
    return { ...record, snapshot };
  }

  materialize(record: PreparedMountRecord) {
    this.publish((candidate) => {
      populateSnapshot(candidate, record);
    });
  }
  replace(record: PreparedMountRecord) {
    this.publish((candidate) => {
      candidate.removeTree(record.path);
      populateSnapshot(candidate, record);
    });
  }
  remove(path: AbsolutePath) {
    this.publish((candidate) => {
      candidate.removeTree(path);
    });
  }
  exists(path: AbsolutePath) {
    return Boolean(this.store.get(path, false));
  }

  private publish(change: (store: NodeStore) => void) {
    const candidate = this.candidate();
    change(candidate);
    this.store.restore(candidate.snapshot(0));
  }
  private candidate() {
    const store = new NodeStore();
    store.restore(this.store.snapshot(0));
    return store;
  }
  private snapshot(
    entries: [string, string][],
    resourceReferences?: Record<string, object>,
  ): PublishedSnapshot {
    const byteCount = this.byteCount(entries);
    this.assertWithinLimits(entries.length, byteCount);
    return snapshotOf(entries, byteCount, resourceReferences);
  }
  private byteCount(entries: [string, string][]) {
    return entries.reduce((count, entry) => this.countBytes(count, entry), 0);
  }
  private countBytes(count: number, [, content]: [string, string]) {
    return count + Buffer.byteLength(content);
  }
  private assertWithinLimits(fileCount: number, byteCount: number) {
    if (fileCount > this.limits.files) {
      throw new Error(`Snapshot exceeds ${this.limits.files} files`);
    }
    if (byteCount > this.limits.bytes) {
      throw new Error(`Snapshot exceeds ${this.limits.bytes} bytes`);
    }
  }
}

function snapshotOf(
  entries: [string, string][],
  byteCount: number,
  resourceReferences?: Record<string, object>,
): PublishedSnapshot {
  const copied = copiedEntries(entries);
  const fileCount = entries.length;
  return { entries: copied, fileCount, byteCount, resourceReferences };
}

function copiedEntries(entries: [string, string][]): [string, string][] {
  return entries.map(([path, content]) => [path, content]);
}
