import { CommandContext } from "../commands/CommandContext";
import { WorkspaceOperation, WorkspaceValue } from "./WorkspaceOperation";
import { boundedPaths, findEntries } from "./WorkspaceFind";
import { testPath } from "./WorkspaceTest";
import { WorkspaceWalker } from "./WorkspaceWalker";
import { grep } from "./WorkspaceGrep";
import { diff } from "./WorkspaceDiff";

export class WorkspaceOperations {
  constructor(private readonly context: () => CommandContext) {}

  invoke(operation: WorkspaceOperation): WorkspaceValue {
    return operation.name === "grep" ? this.grep(operation)
      : operation.name === "diff" ? this.diff(operation)
      : literacy(operation)
      ? this.literacy(operation)
      : this.readOperation(operation as ReadOperation);
  }
  private grep(operation: Extract<WorkspaceOperation, { name: "grep" }>) {
    return { kind: "grep" as const, matches: grep(this.context(), operation.pattern, operation.paths, operation.limit) };
  }
  private diff(operation: Extract<WorkspaceOperation, { name: "diff" }>) {
    return {
      kind: "diff" as const,
      changes: diff(
        this.context(), operation.left, operation.right, operation.limit,
      ),
    };
  }
  private readOperation(operation: ReadOperation): WorkspaceValue {
    return operation.name === "list" ? this.list(operation.path)
      : operation.name === "read" ? this.read(operation.path)
        : this.inspect(operation.path);
  }
  private literacy(operation: LiteracyOperation): WorkspaceValue {
    const path = this.context().resolve(operation.path);
    return operation.name === "tree" ? this.tree(path, operation)
      : operation.name === "find" ? this.find(path, operation)
        : { kind: "test", value: testPath(this.context(), path, operation.predicate) };
  }
  private tree(
    path: import("../core/AbsolutePath").AbsolutePath,
    operation: TreeOperation,
  ): WorkspaceValue {
    return { kind: "tree", path, entries: this.walker(operation).tree(path) };
  }
  private find(path: import("../core/AbsolutePath").AbsolutePath, operation: FindOperation): WorkspaceValue {
    const entries = this.walker({ ...operation, limit: undefined }).all(path);
    return {
      kind: "find",
      paths: boundedPaths(
        findEntries(entries, operation.pattern, operation.type),
        operation.limit,
      ),
    };
  }
  private walker(operation: TreeOperation | FindOperation) {
    const depth = operation.name === "tree" ? operation.depth ?? 3 : 10;
    const limit = operation.limit ?? 1000;
    return new WorkspaceWalker(this.context(), depth, limit);
  }
  private list(value: string): WorkspaceValue {
    const path = this.context().resolve(value);
    return { kind: "list", path, entries: this.context().list(path) };
  }
  private read(value: string): WorkspaceValue {
    const path = this.context().resolve(value);
    return { kind: "read", path, text: this.context().read(path) };
  }
  private inspect(value: string): WorkspaceValue {
    const path = this.context().resolve(value);
    return { kind: "inspect", path, type: this.context().type(path), origins: this.context().provenance(path) };
  }
}

type TreeOperation = Extract<WorkspaceOperation, { name: "tree" }>;
type FindOperation = Extract<WorkspaceOperation, { name: "find" }>;
type ReadOperation = Exclude<WorkspaceOperation,
  { name: "grep" | "diff" | "capture" | "restore" }>;
type LiteracyOperation =
  | TreeOperation
  | FindOperation
  | Extract<WorkspaceOperation, { name: "test" }>;
function literacy(
  operation: WorkspaceOperation,
): operation is LiteracyOperation {
  return operation.name === "tree" || operation.name === "find" || operation.name === "test";
}
