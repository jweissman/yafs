import { mkdir, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { syncDirectory } from "./BlobDigest";

export async function writeBlob(
  directory: string,
  path: string,
  bytes: Uint8Array,
) {
  const temporary = temporaryPath(path);
  await prepareShard(directory, path);
  await writeTemporary(temporary, bytes);
  return replaceTemporary(temporary, path);
}

function temporaryPath(path: string) {
  return `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
}

function prepareShard(directory: string, path: string) {
  const shard = join(directory, path.slice(-64, -62));
  return mkdir(shard, { recursive: true });
}

async function replaceTemporary(temporary: string, path: string) {
  await rename(temporary, path);
  return syncDirectory(path);
}

async function writeTemporary(path: string, bytes: Uint8Array) {
  const file = await open(path, "w");
  await file.write(bytes);
  await file.sync();
  await file.close();
}
