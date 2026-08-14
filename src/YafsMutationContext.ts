import { AbsolutePath } from "./core/AbsolutePath";
import { YafsOperationQueue } from "./YafsOperationQueue";

export function mutationContext(operations: YafsOperationQueue) {
  return {
    ...simpleMutations(operations),
    ...afterCommit(operations),
    symlink: (target: string, path: AbsolutePath) =>
      operations.add({ type: "symlink", target, path }),
    union: (path: AbsolutePath, layers: AbsolutePath[]) =>
      union(operations, path, layers),
  };
}

function afterCommit(operations: YafsOperationQueue) {
  return {
    afterCommit: (effect: () => void) => operations.afterCommit(effect),
  };
}

function simpleMutations(operations: YafsOperationQueue) {
  return {
    ...fileMutations(operations),
    remove: (path: AbsolutePath) => operations.add({ type: "remove", path }),
    rmdir: (path: AbsolutePath) => operations.add({ type: "rmdir", path }),
  };
}

function fileMutations(operations: YafsOperationQueue) {
  return {
    mkdir: (path: AbsolutePath) => operations.add({ type: "mkdir", path }),
    touch: (path: AbsolutePath) => operations.add({ type: "touch", path }),
    write: (path: AbsolutePath, content: string) =>
      operations.add({ type: "write", path, content }),
  };
}

function union(
  operations: YafsOperationQueue,
  path: AbsolutePath,
  layers: AbsolutePath[],
) {
  if (!layers.length) {
    throw new Error("union requires at least one layer");
  }
  operations.add({ type: "union", path, layers });
}
