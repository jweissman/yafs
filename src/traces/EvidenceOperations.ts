import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { CaptureValue, RestoreValue } from "../operations/WorkspaceOperation";
import { traceFilesystem } from "./TraceContextFilesystem";
import { Trace } from "./TraceService";

export async function capture(
  context: CommandContext,
  source: AbsolutePath,
  artifact: AbsolutePath,
  limit?: number,
): Promise<CaptureValue> {
  assertAbsent(context, artifact, "Capture");
  const trace = await traced(context, source, limit);
  return publishedCapture(context, source, artifact, trace);
}

function publishedCapture(
  context: CommandContext,
  source: AbsolutePath,
  artifact: AbsolutePath,
  trace: Trace,
): CaptureValue {
  publish(context, artifact, trace);
  return captured(source, artifact, trace);
}

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

async function traced(
  context: CommandContext,
  source: AbsolutePath,
  limit?: number,
) {
  const trace = await capturedTrace(context, source, limit);
  return withResourceReference(context, source, trace);
}

async function capturedTrace(
  context: CommandContext,
  source: AbsolutePath,
  limit?: number,
) {
  const fs = traceFilesystem(context);
  const origin = providerOrigin(context, source);
  const at = context.clock.now().toISOString();
  return context.traces.capture(fs, source, origin, at, limit);
}

function withResourceReference(
  context: CommandContext,
  source: AbsolutePath,
  trace: Trace,
) {
  trace.resourceReference = context.resourceReference(source);
  return trace;
}

function publish(
  context: CommandContext,
  artifact: AbsolutePath,
  trace: Trace,
) {
  context.afterCommit(() => context.traces.retain(trace, owner(artifact)));
  context.mkdir(artifact);
  context.write(manifest(artifact), JSON.stringify(trace));
}

function captured(source: AbsolutePath, artifact: AbsolutePath, trace: Trace) {
  return {
    kind: "capture" as const,
    source,
    artifact,
    capturedAt: trace.capturedAt,
    entries: trace.entries.length,
  };
}

function assertAbsent(
  context: CommandContext,
  path: AbsolutePath,
  action: string,
) {
  if (context.exists(path)) {
    throw new Error(`${action} destination already exists: ${path}`);
  }
}

function providerOrigin(context: CommandContext, path: AbsolutePath) {
  return context.provenance(path).find((origin) => origin.kind === "provider");
}

function restored(
  artifact: AbsolutePath,
  destination: AbsolutePath,
  trace: Trace,
) {
  const entries = trace.entries.length;
  return { kind: "restore" as const, artifact, destination, entries };
}

function manifest(path: AbsolutePath) {
  return `${path}/trace.json` as AbsolutePath;
}

function owner(path: AbsolutePath) {
  return `trace:${path}`;
}
