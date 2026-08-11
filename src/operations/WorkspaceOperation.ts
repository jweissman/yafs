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
  | { name: "grep"; pattern: string; paths: string[]; limit?: number };

export type NodeType = "file" | "directory" | "symlink";
export type TestPredicate = "-e" | "-f" | "-d" | "-L";

export type WorkspaceValue =
  | { kind: "list"; path: AbsolutePath; entries: string[] }
  | { kind: "read"; path: AbsolutePath; text: string }
  | { kind: "inspect"; path: AbsolutePath; type: string; origins: Provenance[] }
  | { kind: "tree"; path: AbsolutePath; entries: TreeEntry[] }
  | { kind: "find"; paths: AbsolutePath[] }
  | { kind: "test"; value: boolean }
  | { kind: "diff"; changes: DiffChange[] }
  | { kind: "grep"; matches: GrepMatch[] }
  | CaptureValue
  | RestoreValue;

export type TreeEntry = { path: AbsolutePath; type: NodeType; depth: number };
export type GrepMatch = { path: AbsolutePath; line: number; text: string };
export type DiffChange = {
  path: string;
  kind: "added" | "removed" | "changed";
};
export type CaptureValue = {
  kind: "capture";
  source: AbsolutePath;
  artifact: AbsolutePath;
  capturedAt: string;
  entries: number;
};
export type RestoreValue = {
  kind: "restore";
  artifact: AbsolutePath;
  destination: AbsolutePath;
  entries: number;
};
