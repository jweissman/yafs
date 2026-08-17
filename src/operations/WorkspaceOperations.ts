import { CommandContext } from "../commands/CommandContext";
import { WorkspaceOperation, WorkspaceValue } from "./WorkspaceOperation";
import { grep } from "./WorkspaceGrep";
import { diff } from "./WorkspaceDiff";
import { startHere } from "./WorkspaceStartHere";
import { literacy, literacyValue } from "./WorkspaceLiteracyInvoke";

export class WorkspaceOperations {
  constructor(private readonly context: () => CommandContext) {}

  invoke(operation: WorkspaceOperation): WorkspaceValue {
    return operation.name === "startHere"
      ? startHere(this.context())
      : this.otherOperation(operation);
  }
  private otherOperation(operation: WorkspaceOperation): WorkspaceValue {
    return operation.name === "grep"
      ? this.grep(operation)
      : operation.name === "diff"
        ? this.diff(operation)
        : literacy(operation)
          ? literacyValue(this.context(), operation)
          : this.readOperation(operation as ReadOperation);
  }
  private grep(operation: Extract<WorkspaceOperation, { name: "grep" }>) {
    const { pattern, paths } = operation;
    const found = grep(this.context(), pattern, paths, grepOptions(operation));
    return { kind: "grep" as const, ...found };
  }
  private diff(operation: Extract<WorkspaceOperation, { name: "diff" }>) {
    const { left, right, limit } = operation;
    const changes = diff(this.context(), left, right, limit);
    return { kind: "diff" as const, changes };
  }
  private readOperation(operation: ReadOperation): WorkspaceValue {
    return operation.name === "list"
      ? this.list(operation.path)
      : operation.name === "read"
        ? this.read(operation.path)
        : this.inspect(operation.path);
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
    return {
      kind: "inspect",
      path,
      type: this.context().type(path),
      origins: this.context().provenance(path),
    };
  }
}

type ReadOperation = Exclude<
  WorkspaceOperation,
  { name: "grep" | "diff" | "capture" | "restore" | "startHere" }
>;

function grepOptions(operation: Extract<WorkspaceOperation, { name: "grep" }>) {
  const { limit, ignoreCase, invert, countOnly, filesOnly } = operation;
  return { limit, ignoreCase, invert, countOnly, filesOnly };
}
