import { AbsolutePath } from "../core/AbsolutePath";
import { VfsOperation } from "./VfsOperation";

export type Mutator = {
  mkdir(path: AbsolutePath, at: Date): void;
  touch(path: AbsolutePath, at: Date): void;
  write(path: AbsolutePath, content: string, at: Date): void;
  symlink(target: string, path: AbsolutePath, at: Date): void;
  rmdir(path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[], at: Date): void;
  remove(path: AbsolutePath): void;
};

type Replayed = Exclude<
  VfsOperation,
  { type: "mount" | "unmount" | "refresh" }
>;
type Written = Exclude<Replayed, { type: "mkdir" | "touch" }>;
type Removed = Exclude<Written, { type: "write" | "symlink" }>;

export function applyOperation(mutator: Mutator, operation: VfsOperation) {
  if (
    operation.type === "mount" ||
    operation.type === "unmount" ||
    operation.type === "refresh"
  ) {
    return;
  }
  return applyAt(mutator, operation, new Date(operation.at));
}

function applyAt(mutator: Mutator, operation: Replayed, at: Date) {
  if (operation.type === "mkdir") {
    return mutator.mkdir(operation.path, at);
  }
  if (operation.type === "touch") {
    return mutator.touch(operation.path, at);
  }
  return applyWrite(mutator, operation, at);
}

function applyWrite(mutator: Mutator, operation: Written, at: Date) {
  if (operation.type === "write") {
    return mutator.write(operation.path, operation.content, at);
  }
  if (operation.type === "symlink") {
    return mutator.symlink(operation.target, operation.path, at);
  }
  return applyRemoval(mutator, operation, at);
}

function applyRemoval(mutator: Mutator, operation: Removed, at: Date) {
  if (operation.type === "rmdir") {
    return mutator.rmdir(operation.path);
  }
  return operation.type === "union"
    ? mutator.union(operation.path, operation.layers, at)
    : mutator.remove(operation.path);
}
