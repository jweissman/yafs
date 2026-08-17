import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";

export type WorkspaceOperation =
  | { name: "list"; path: string }
  | { name: "read"; path: string }
  | { name: "inspect"; path: string }
  | { name: "tree"; path: string; depth?: number; limit?: number }
  | {
      name: "find";
      path: string;
      pattern?: string;
      type?: NodeType;
      limit?: number;
    }
  | { name: "test"; path: string; predicate: TestPredicate }
  | { name: "diff"; left: string; right: string; limit?: number }
  | { name: "capture"; source: string; artifact: string; limit?: number }
  | { name: "restore"; artifact: string; destination: string }
  | {
      name: "grep";
      pattern: string;
      paths: string[];
      limit?: number;
      ignoreCase?: boolean;
      invert?: boolean;
      countOnly?: boolean;
      filesOnly?: boolean;
    }
  | { name: "startHere" };

export type NodeType = "file" | "directory" | "symlink";
export type TestPredicate = "-e" | "-f" | "-d" | "-L";

export type WorkspaceValue =
  | { kind: "list"; path: AbsolutePath; entries: string[] }
  | { kind: "read"; path: AbsolutePath; text: string }
  | { kind: "inspect"; path: AbsolutePath; type: string; origins: Provenance[] }
  | { kind: "tree"; path: AbsolutePath; entries: TreeEntry[]; truncated: boolean }
  | { kind: "find"; paths: AbsolutePath[]; truncated: boolean }
  | { kind: "test"; value: boolean }
  | { kind: "diff"; changes: DiffChange[] }
  | {
      kind: "grep";
      matches: GrepMatch[];
      truncated: boolean;
      count: number;
      files: AbsolutePath[];
    }
  | CaptureValue
  | RestoreValue
  | StartHereValue;

export interface TreeEntry {
  path: AbsolutePath;
  type: NodeType;
  depth: number;
}
export interface GrepMatch {
  path: AbsolutePath;
  line: number;
  text: string;
}
export interface DiffChange {
  path: string;
  kind: "added" | "removed" | "changed";
}
export interface CaptureValue {
  kind: "capture";
  source: AbsolutePath;
  artifact: AbsolutePath;
  capturedAt: string;
  entries: number;
}
export interface RestoreValue {
  kind: "restore";
  artifact: AbsolutePath;
  destination: AbsolutePath;
  entries: number;
}
export interface MountSummary {
  path: AbsolutePath;
  provider: string;
  revision: string;
  fetchedAt?: string;
  capabilities: string[];
  resourceShape?: string;
}
export interface RootMountSummary {
  root: string;
  mount: AbsolutePath;
  provider: string;
}
export interface StartHereValue {
  kind: "startHere";
  principal: string;
  cwd: AbsolutePath;
  now: string;
  mounts: MountSummary[];
  scoped: boolean;
  roots?: string[];
  rootMounts?: RootMountSummary[];
  recommendedFirst: string[];
}
