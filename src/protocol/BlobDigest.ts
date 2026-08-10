import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertDigest(digest: string) {
  if (!validDigest(digest)) {
    throw new Error("Invalid blob digest");
  }
}

export function validDigest(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

export function validShard(value: string) {
  return /^[a-f0-9]{2}$/.test(value);
}

export function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function assertMissing(error: unknown): false {
  if (!missing(error)) {
    throw error;
  }
  return false;
}

export async function syncDirectory(path: string) {
  const file = await open(join(path, ".."), "r");
  await file.sync();
  await file.close();
}
