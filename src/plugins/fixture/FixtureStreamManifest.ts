import { StreamSpec } from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";

export function fixtureStreams(
  value: unknown,
): Record<string, StreamSpec> | undefined {
  return value === undefined ? undefined : parsedStreams(value);
}

function parsedStreams(value: unknown): Record<string, StreamSpec> {
  const entries = Object.entries(object(value, "fixture streams"));
  assertPaths(entries);
  const specs = entries.map((entry) => [entry[0], streamSpec(entry[1])]);
  return Object.fromEntries(specs);
}

function assertPaths(entries: [string, unknown][]) {
  if (!entries.every((entry) => relative(entry[0]))) {
    throw new Error("Invalid fixture stream path");
  }
}

function streamSpec(value: unknown): StreamSpec {
  const spec = object(value, "fixture stream");
  only(spec, ["chunks", "intervalMs"], "fixture stream");
  if (!validChunks(spec.chunks)) {
    throw new Error("Invalid fixture stream chunks");
  }
  assertInterval(spec.intervalMs);
  return { chunks: spec.chunks, intervalMs: spec.intervalMs as number };
}

function assertInterval(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error("Invalid fixture stream interval");
  }
}

function validChunks(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((chunk) => typeof chunk === "string")
  );
}
