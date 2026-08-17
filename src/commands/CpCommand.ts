import { AbsolutePath } from "../core/AbsolutePath";
import { CommandContext } from "./CommandContext";

interface CopyArgs {
  context: CommandContext;
  source: AbsolutePath;
  dest: AbsolutePath;
  recursive: boolean;
}

export class CpCommand {
  readonly name = "cp";
  readonly synopsis = "cp [-r] SOURCE DEST";
  readonly access = "mutate" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    copy(parsed(context, args, this.name));
    return "";
  }
}

function parsed(
  context: CommandContext,
  args: string[],
  name: string,
): CopyArgs {
  const recursive = args[0] === "-r";
  const rest = recursive ? args.slice(1) : args;
  return { context, ...resolvedPaths(context, rest, name), recursive };
}

function resolvedPaths(context: CommandContext, rest: string[], name: string) {
  const source = context.resolve(context.required(name, rest, 0));
  const dest = context.resolve(context.required(name, rest, 1));
  return { source, dest };
}

export function copy(args: CopyArgs) {
  const type = args.context.type(args.source, false);
  if (type === "directory") {
    copyDirectory(args);
    return;
  }
  copyLeaf(args, type);
}

function copyDirectory(args: CopyArgs) {
  const { context, source, dest, recursive } = args;
  if (!recursive) {
    throw new Error(`cp: ${source} is a directory (not copied, use -r)`);
  }
  context.mkdir(dest);
  context.list(source).forEach((name) => {
    copyChild(args, name);
  });
}

function copyChild(args: CopyArgs, name: string) {
  const { context, source, dest } = args;
  copy({
    context,
    source: child(source, name),
    dest: child(dest, name),
    recursive: true,
  });
}

function copyLeaf(args: CopyArgs, type: "file" | "symlink") {
  const { context, source, dest } = args;
  if (type === "symlink") {
    context.symlink(context.readlink(source), dest);
    return;
  }
  context.write(dest, context.read(source));
}

function child(path: AbsolutePath, name: string): AbsolutePath {
  return `${path}/${name}`.replace("//", "/") as AbsolutePath;
}
