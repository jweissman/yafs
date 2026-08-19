import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { TreeEntry } from "./WorkspaceOperation";

export class WorkspaceWalker {
  private truncated = false;

  constructor(
    private readonly context: CommandContext,
    private readonly depth: number,
    private readonly limit: number,
    private readonly strict = true,
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

  wasTruncated(): boolean {
    return this.truncated;
  }

  private children(path: AbsolutePath, depth: number, entries: TreeEntry[]) {
    if (depth >= this.depth || this.truncated) {
      return;
    }
    this.context.list(path).forEach((name) => {
      this.visit(child(path, name), depth + 1, entries);
    });
  }

  private visit(path: AbsolutePath, depth: number, entries: TreeEntry[]) {
    if (!this.hasRoom(entries)) {
      return;
    }
    const type = this.context.type(path, false);
    entries.push({ path, type, depth });
    if (type === "directory") {
      this.children(path, depth, entries);
    }
  }

  private hasRoom(entries: TreeEntry[]): boolean {
    if (entries.length < this.limit) {
      return true;
    }
    this.truncated = true;
    if (this.strict) {
      throw new Error("Result limit exceeded");
    }
    return false;
  }
}

function child(path: AbsolutePath, name: string) {
  return `${path}/${name}`.replace("//", "/") as AbsolutePath;
}
