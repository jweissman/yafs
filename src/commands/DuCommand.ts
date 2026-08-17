import { Buffer } from "node:buffer";

import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "./CommandContext";
import { commandPath } from "./commandPath";

interface Totals {
  files: number;
  bytes: number;
}

// Answers two questions that came up repeatedly without a direct way to
// ask them: how many files are under this path, and how big is it --
// both matter now that SnapshotLimits/byte budgets are a real, recurring
// operational concern, and "how many PRs are there" has no clean answer
// without piping ls into wc (which yafs doesn't support -- see
// LANGUAGE-ROADMAP.md's pipeline scoping).
export class DuCommand {
  readonly name = "du";
  readonly synopsis = "du PATH";
  readonly access = "read" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const path = commandPath(context, args, this.name);
    const totals = totalsFor(context, path);
    return `files: ${String(totals.files)}\nbytes: ${String(totals.bytes)}`;
  }
}

function totalsFor(context: CommandContext, path: AbsolutePath): Totals {
  return context.type(path, false) === "directory"
    ? directoryTotals(context, path)
    : leafTotals(context, path);
}

function directoryTotals(context: CommandContext, path: AbsolutePath): Totals {
  return context
    .list(path)
    .reduce((sum, name) => added(sum, totalsFor(context, child(path, name))), {
      files: 0,
      bytes: 0,
    });
}

function leafTotals(context: CommandContext, path: AbsolutePath): Totals {
  const isSymlink = context.type(path, false) === "symlink";
  const bytes = isSymlink ? 0 : Buffer.byteLength(context.read(path));
  return { files: 1, bytes };
}

function added(a: Totals, b: Totals): Totals {
  return { files: a.files + b.files, bytes: a.bytes + b.bytes };
}

function child(path: AbsolutePath, name: string): AbsolutePath {
  return `${path}/${name}`.replace("//", "/") as AbsolutePath;
}
