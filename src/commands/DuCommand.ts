import { Buffer } from "node:buffer";

import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "./CommandContext";
import { commandPath } from "./commandPath";

interface Totals {
  files: number;
  bytes: number;
}

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
