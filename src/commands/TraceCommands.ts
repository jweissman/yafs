import { capture, restore as restoreArtifact } from "../traces/EvidenceOperations";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";

export function traceCommands(): BuiltinCommand[] {
  return [captureCommand(), restoreCommand(), blobCommand()];
}

function captureCommand(): BuiltinCommand {
  return {
    name: "capture",
    synopsis: "capture [--limit COUNT] SOURCE ARTIFACT_DIRECTORY",
    access: "mutate",
    execute: (context, args) => captureCommandRun(context, args),
  };
}
async function captureCommandRun(context: CommandContext, args: string[]) {
  const options = captureOptions(args);
  const source = path(context, args, options.offset, "capture");
  const artifact = path(context, args, options.offset + 1, "capture");
  await capture(context, source, artifact, options.limit);
  return "";
}
function restoreCommand(): BuiltinCommand {
  return {
    name: "restore",
    synopsis: "restore ARTIFACT_DIRECTORY DESTINATION",
    access: "mutate",
    execute: (context, args) => restore(context, args),
  };
}
async function restore(context: CommandContext, args: string[]) {
  const artifact = path(context, args, 0, "restore");
  const destination = path(context, args, 1, "restore");
  await restoreArtifact(context, artifact, destination);
  return "";
}
function blobCommand(): BuiltinCommand {
  return {
    name: "blobs",
    synopsis: "blobs gc",
    access: "control",
    execute: (context, args) => gc(context, args),
  };
}
async function gc(context: CommandContext, args: string[]) {
  if (args[0] !== "gc") {
    throw new Error("blobs requires gc");
  }
  return JSON.stringify(await context.traces.gc());
}
function path(
  context: CommandContext,
  args: string[],
  index: number,
  command: string,
) {
  return context.resolve(context.required(command, args, index));
}

function captureOptions(args: string[]) {
  if (args[0] !== "--limit") {
    return { offset: 0, limit: undefined };
  }
  const count = args[1];
  if (!/^\d+$/.test(count || "")) {
    throw new Error("capture requires --limit COUNT");
  }
  return { offset: 2, limit: Number(count) };
}
