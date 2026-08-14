import { CommandContext } from "../commands/CommandContext";
import { AbsolutePath } from "../core/AbsolutePath";
import { CaptureValue } from "../operations/WorkspaceOperation";
import { traceFilesystem } from "./TraceContextFilesystem";
import { Trace } from "./TraceService";
import { manifest } from "./TraceManifestPath";

export { restore } from "./EvidenceRestore";

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
  return context.traces.capture(fs, source, { origin, capturedAt: at, limit });
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

function owner(path: AbsolutePath) {
  return `trace:${path}`;
}
