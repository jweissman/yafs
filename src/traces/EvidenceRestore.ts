import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { RestoreValue } from "../operations/WorkspaceOperation";
import { traceFilesystem } from "./TraceContextFilesystem";
import { Trace } from "./TraceService";
import { manifest } from "./TraceManifestPath";

export async function restore(
  context: CommandContext,
  artifact: AbsolutePath,
  destination: AbsolutePath,
): Promise<RestoreValue> {
  const trace = await materializeTrace(context, artifact, destination);
  return restored(artifact, destination, trace);
}

async function materializeTrace(
  context: CommandContext,
  artifact: AbsolutePath,
  destination: AbsolutePath,
) {
  const trace = parsedTrace(context, artifact);
  const fs = traceFilesystem(context);
  await context.traces.materialize(fs, trace, destination);
  return trace;
}

function parsedTrace(context: CommandContext, artifact: AbsolutePath) {
  const trace = context.traces.parse(context.read(manifest(artifact)));
  assertRestoreLimit(trace);
  return trace;
}

function assertRestoreLimit(trace: Trace) {
  if (trace.entries.length > 10000) {
    throw new Error("Result limit exceeded");
  }
}

function restored(
  artifact: AbsolutePath,
  destination: AbsolutePath,
  trace: Trace,
) {
  const entries = trace.entries.length;
  return { kind: "restore" as const, artifact, destination, entries };
}
