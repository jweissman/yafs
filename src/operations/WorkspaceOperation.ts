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

export * from "./WorkspaceValue";
