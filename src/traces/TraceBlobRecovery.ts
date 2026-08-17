import { BlobStore } from "../protocol/BlobStore";
import { Trace, TraceReifier } from "./TraceTypes";

export interface RecoveryTarget {
  blobs: BlobStore;
  reifier?: TraceReifier;
}

export async function bytesFor(
  target: RecoveryTarget,
  trace: Trace,
  digest: string,
) {
  return (await target.blobs.get(digest)) ?? recover(target, trace, digest);
}

async function recover(target: RecoveryTarget, trace: Trace, digest: string) {
  if (!trace.resourceReference || !target.reifier) {
    throw new Error(`Missing trace blob: ${digest}`);
  }
  const bytes = await recoverBytes(target.reifier, trace, digest);
  return saveRecovered(target.blobs, bytes, digest);
}

async function saveRecovered(
  blobs: BlobStore,
  bytes: Uint8Array,
  digest: string,
) {
  assertRecoveredDigest(await blobs.put(bytes), digest);
  return bytes;
}

async function recoverBytes(
  reifier: TraceReifier,
  trace: Trace,
  digest: string,
) {
  return (await reifier.reify(trace, digest)) ?? missingBlob(digest);
}

function missingBlob(digest: string): never {
  throw new Error(`Missing trace blob: ${digest}`);
}

function assertRecoveredDigest(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Trace reifier returned wrong content: ${expected}`);
  }
}
