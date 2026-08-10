import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { NodeType, TreeEntry } from "./WorkspaceOperation";

export class WorkspaceWalker {
  constructor(
    private readonly context: CommandContext,
    private readonly depth: number,
    private readonly limit: number,
  ) {}

  tree(path: AbsolutePath): TreeEntry[] {
    const entries: TreeEntry[] = [];
    this.children(path, 0, entries);
    return entries;
  }

  all(path: AbsolutePath): TreeEntry[] {
    const entries: TreeEntry[] = [];
    this.visit(path, 0, entries);
    return entries;
  }

  private children(path: AbsolutePath, depth: number, entries: TreeEntry[]) {
    if (depth >= this.depth) {
      return;
    }
    this.context.list(path).forEach((name) => {
      this.visit(child(path, name), depth + 1, entries);
    });
  }

  private visit(path: AbsolutePath, depth: number, entries: TreeEntry[]) {
    this.assertRoom(entries);
    const type = this.context.type(path, false) as NodeType;
    entries.push({ path, type, depth });
    if (type === "directory") {
      this.children(path, depth, entries);
    }
  }

  private assertRoom(entries: TreeEntry[]) {
    if (entries.length >= this.limit) {
      throw new Error("Result limit exceeded");
    }
  }
}

function child(path: AbsolutePath, name: string) {
  return `${path}/${name}`.replace("//", "/") as AbsolutePath;
}
