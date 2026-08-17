import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { TreeEntry } from "./WorkspaceOperation";

export class WorkspaceWalker {
  private truncated = false;

  // strict (the default, used by capture/restore/diff/grep) throws when
  // the limit is hit -- those are durability/safety-critical, and a
  // silently-truncated capture masquerading as complete is worse than a
  // loud failure. tree/find are bounded exploratory reads for an agent
  // that can't know the true count in advance; erroring out entirely on
  // a conservative guess (observed live: a model requesting `limit: 20`
  // against 100 real entries) is actively unhelpful, so they opt into
  // non-strict: stop and report `truncated: true` instead of throwing.
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
