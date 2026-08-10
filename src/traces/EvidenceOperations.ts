import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { CaptureValue, RestoreValue } from "../operations/WorkspaceOperation";
import { traceFilesystem } from "./TraceContextFilesystem";
import { Trace } from "./TraceService";

export async function capture(
  context: CommandContext, source: AbsolutePath, artifact: AbsolutePath,
  limit?: number,
): Promise<CaptureValue> {
  assertAbsent(context, artifact, "Capture");
  const trace = await traced(context, source, limit);
  publish(context, artifact, trace);
  return captured(source, artifact, trace);
}

export async function restore(
  context: CommandContext, artifact: AbsolutePath, destination: AbsolutePath,
): Promise<RestoreValue> {
  const trace = context.traces.parse(context.read(manifest(artifact)));
  assertRestoreLimit(trace);
  await context.traces.materialize(
    traceFilesystem(context), trace, destination,
  );
  return restored(artifact, destination, trace);
}

function assertRestoreLimit(trace: Trace) {
  if (trace.entries.length > 10000) {
    throw new Error("Result limit exceeded");
  }
}

async function traced(
  context: CommandContext, source: AbsolutePath, limit?: number,
) {
  const trace = await context.traces.capture(
    traceFilesystem(context), source, providerOrigin(context, source),
    context.clock.now().toISOString(), limit,
  );
  trace.resourceReference = context.resourceReference(source);
  return trace;
}

function publish(
  context: CommandContext, artifact: AbsolutePath, trace: Trace,
) {
  context.afterCommit(() => context.traces.retain(trace, owner(artifact)));
  context.mkdir(artifact);
  context.write(manifest(artifact), JSON.stringify(trace));
}

function captured(source: AbsolutePath, artifact: AbsolutePath, trace: Trace) {
  return {
    kind: "capture" as const, source, artifact, capturedAt: trace.capturedAt,
    entries: trace.entries.length,
  };
}

function assertAbsent(
  context: CommandContext, path: AbsolutePath, action: string,
) {
  if (context.exists(path)) {
    throw new Error(`${action} destination already exists: ${path}`);
  }
}

function providerOrigin(context: CommandContext, path: AbsolutePath) {
  return context.provenance(path).find((origin) => origin.kind === "provider");
}

function restored(
  artifact: AbsolutePath, destination: AbsolutePath, trace: Trace,
) {
  return { kind: "restore" as const, artifact, destination,
    entries: trace.entries.length };
}

function manifest(path: AbsolutePath) {
  return `${path}/trace.json` as AbsolutePath;
}

function owner(path: AbsolutePath) {
  return `trace:${path}`;
}
