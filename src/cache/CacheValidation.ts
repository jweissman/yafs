import { CacheEntry } from "./CacheService";

const maxValueBytes = 1_048_576;

export function assertEntry(entry: CacheEntry) {
  assertShape(entry);
  assertKey(entry.key);
  assertTtl(ttl(entry));
}

function assertShape(entry: CacheEntry) {
  if (!validShape(entry)) {
    throw new Error("Invalid cache entry");
  }
}

function validShape(entry: CacheEntry) {
  return (
    Boolean(entry.digest) &&
    Boolean(entry.createdAt) &&
    Boolean(entry.expiresAt)
  );
}

function ttl(entry: CacheEntry) {
  const created = new Date(entry.createdAt).getTime();
  return new Date(entry.expiresAt).getTime() - created;
}

export function assertKey(key: string) {
  if (!key || key.length > 512 || key.includes("\0")) {
    throw new Error("Invalid cache key");
  }
}

export function assertTtl(ttlMs: number) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 31_536_000_000) {
    throw new Error("Invalid cache TTL");
  }
}

export function assertSize(bytes: number) {
  if (bytes > maxValueBytes) {
    throw new Error(`Cache value exceeds ${maxValueBytes} bytes`);
  }
}
