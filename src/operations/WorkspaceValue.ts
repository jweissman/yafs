import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";
import { NodeType } from "./WorkspaceOperation";

export type WorkspaceValue =
  | { kind: "list"; path: AbsolutePath; entries: string[] }
  | { kind: "read"; path: AbsolutePath; text: string }
  | { kind: "inspect"; path: AbsolutePath; type: string; origins: Provenance[] }
  | {
      kind: "tree";
      path: AbsolutePath;
      entries: TreeEntry[];
      truncated: boolean;
    }
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
