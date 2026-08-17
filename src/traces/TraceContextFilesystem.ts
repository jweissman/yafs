import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { TraceFilesystem } from "./TraceService";

export function traceFilesystem(context: CommandContext): TraceFilesystem {
  return { ...reading(context), ...writing(context) };
}

function reading(context: CommandContext) {
  const files: Pick<TraceFilesystem, "exists" | "type" | "list" | "read"> = {
    exists: (path) => context.exists(path),
    type: (path) => context.type(path),
    list: (path) => context.list(path),
    read: (path) => context.read(path),
  };
  return files;
}

function writing(context: CommandContext) {
  return {
    mkdir: (path: AbsolutePath) => {
      context.mkdir(path);
    },
    write: (path: AbsolutePath, content: string) => {
      context.write(path, content);
    },
  };
}
