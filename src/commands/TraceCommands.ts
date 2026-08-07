import { AbsolutePath } from "../core/AbsolutePath";
import { Provenance } from "../mounts/types";
import { traceFilesystem } from "../traces/TraceContextFilesystem";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";

export function traceCommands(): BuiltinCommand[] {
  return [traceCommand(), reifyCommand(), blobCommand()];
}

function traceCommand(): BuiltinCommand {
  return {
    name: "trace",
    synopsis: "trace SOURCE ARTIFACT_DIRECTORY",
    access: "mutate",
    execute: (context, args) => trace(context, args),
  };
}
async function trace(context: CommandContext, args: string[]) {
  const source = path(context, args, 0, "trace");
  const artifact = path(context, args, 1, "trace");
  if (context.exists(artifact)) {
    throw new Error(`Trace destination already exists: ${artifact}`);
  }
  return capture(context, source, artifact);
}
async function capture(
  context: CommandContext,
  source: AbsolutePath,
  artifact: AbsolutePath,
) {
  const captured = await captureTrace(context, source);
  captured.resourceReference = context.resourceReference(source);
  publish(context, artifact, captured);
  return "";
}
function captureTrace(context: CommandContext, source: AbsolutePath) {
  return context.traces.capture(
    traceFilesystem(context),
    source,
    providerOrigin(context, source),
    context.clock.now().toISOString(),
  );
}
function publish(
  context: CommandContext,
  artifact: AbsolutePath,
  captured: import("../traces/TraceService").Trace,
) {
  context.afterCommit(() => context.traces.retain(captured, owner(artifact)));
  context.mkdir(artifact);
  context.write(manifest(artifact), JSON.stringify(captured));
}
function reifyCommand(): BuiltinCommand {
  return {
    name: "reify",
    synopsis: "reify ARTIFACT_DIRECTORY DESTINATION",
    access: "mutate",
    execute: (context, args) => reify(context, args),
  };
}
async function reify(context: CommandContext, args: string[]) {
  const artifact = path(context, args, 0, "reify");
  const destination = path(context, args, 1, "reify");
  const captured = context.traces.parse(context.read(manifest(artifact)));
  await context.traces.materialize(
    traceFilesystem(context),
    captured,
    destination,
  );
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
function providerOrigin(
  context: CommandContext,
  path: AbsolutePath,
): Provenance | undefined {
  return context.provenance(path).find((origin) => origin.kind === "provider");
}
function manifest(path: AbsolutePath) {
  return `${path}/trace.json` as AbsolutePath;
}
function owner(path: AbsolutePath) {
  return `trace:${path}`;
}
