import { AbsolutePath } from "../core/AbsolutePath";
import { VfsOperation } from "./VfsOperation";

export interface Mutator {
  mkdir(path: AbsolutePath, at: Date): void;
  touch(path: AbsolutePath, at: Date): void;
  write(path: AbsolutePath, content: string, at: Date): void;
  symlink(target: string, path: AbsolutePath, at: Date): void;
  rmdir(path: AbsolutePath): void;
  union(path: AbsolutePath, layers: AbsolutePath[], at: Date): void;
  remove(path: AbsolutePath): void;
  removeTreeChecked(path: AbsolutePath): void;
}

type Replayed = Exclude<
  VfsOperation,
  { type: "mount" | "unmount" | "refresh" }
>;
type Written = Exclude<Replayed, { type: "mkdir" | "touch" }>;
type Removed = Exclude<Written, { type: "write" | "symlink" }>;

export function applyOperation(mutator: Mutator, operation: VfsOperation) {
  if (isLifecycleOnly(operation)) {
    return;
  }
  applyAt(mutator, operation, new Date(operation.at));
}

function isLifecycleOnly(operation: VfsOperation) {
  return (
    operation.type === "mount" ||
    operation.type === "unmount" ||
    operation.type === "refresh"
  );
}

function applyAt(mutator: Mutator, operation: Replayed, at: Date) {
  if (operation.type === "mkdir" || operation.type === "touch") {
    applyCreate(mutator, operation, at);
    return;
  }
  applyWrite(mutator, operation, at);
}

type Created = Extract<Replayed, { type: "mkdir" | "touch" }>;

function applyCreate(mutator: Mutator, operation: Created, at: Date) {
  if (operation.type === "mkdir") {
    mutator.mkdir(operation.path, at);
    return;
  }
  mutator.touch(operation.path, at);
}

function applyWrite(mutator: Mutator, operation: Written, at: Date) {
  if (operation.type === "write" || operation.type === "symlink") {
    applyContent(mutator, operation, at);
    return;
  }
  applyRemoval(mutator, operation, at);
}

type Content = Extract<Written, { type: "write" | "symlink" }>;

function applyContent(mutator: Mutator, operation: Content, at: Date) {
  if (operation.type === "write") {
    mutator.write(operation.path, operation.content, at);
    return;
  }
  mutator.symlink(operation.target, operation.path, at);
}

function applyRemoval(mutator: Mutator, operation: Removed, at: Date) {
  if (operation.type === "rmdir") {
    mutator.rmdir(operation.path);
    return;
  }
  applyDeletion(mutator, operation, at);
}

type Deletion = Exclude<Removed, { type: "rmdir" }>;

function applyDeletion(mutator: Mutator, operation: Deletion, at: Date) {
  if (operation.type === "removeTree" || operation.type === "union") {
    applyKept(mutator, operation, at);
    return;
  }
  mutator.remove(operation.path);
}

type Kept = Extract<Deletion, { type: "removeTree" | "union" }>;

function applyKept(mutator: Mutator, operation: Kept, at: Date) {
  if (operation.type === "removeTree") {
    mutator.removeTreeChecked(operation.path);
    return;
  }
  mutator.union(operation.path, operation.layers, at);
}
