import { BlobStore } from "../protocol/BlobStore";

export type CacheEntry = {
  kind: "yafs-cache-entry";
  version: 1;
  key: string;
  digest: string;
  createdAt: string;
  expiresAt: string;
  bytes: number;
};
const maxValueBytes = 1_048_576;
type PutRequest = { key: string; ttlMs: number; now: Date };

export class CacheService {
  constructor(private readonly blobs: BlobStore) {}

  async create(
    key: string,
    content: string,
    ttlMs: number,
    now: Date,
  ): Promise<CacheEntry> {
    this.assertKey(key);
    this.assertTtl(ttlMs);
    return this.created({ key, ttlMs, now }, content);
  }

  private async created(
    request: PutRequest,
    content: string,
  ): Promise<CacheEntry> {
    const bytes = new TextEncoder().encode(content);
    this.assertSize(bytes.byteLength);
    const digest = await this.blobs.put(bytes);
    return this.metadata({ ...request, digest, bytes: bytes.byteLength });
  }

  private metadata(
    stored: PutRequest & { digest: string; bytes: number },
  ): CacheEntry {
    const { key, ttlMs, now, digest, bytes } = stored;
    const identity = {
      kind: "yafs-cache-entry" as const,
      version: 1 as const,
      key,
      digest,
      bytes,
    };
    return { ...identity, ...this.lifespan(now, ttlMs) };
  }

  private lifespan(now: Date, ttlMs: number) {
    return {
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
  }

  async read(entry: CacheEntry) {
    return new TextDecoder().decode(await this.bytes(entry));
  }
  private async bytes(entry: CacheEntry) {
    const bytes = await this.blobs.get(entry.digest);
    if (!bytes) {
      throw new Error(`Missing cache blob: ${entry.digest}`);
    }
    return bytes;
  }

  parse(content: string): CacheEntry {
    const entry = JSON.parse(content) as CacheEntry;
    this.assertEntry(entry);
    return entry;
  }

  retain(entry: CacheEntry) {
    this.blobs.retain(entry.digest, owner(entry.key));
  }
  release(entry: CacheEntry) {
    this.blobs.release(entry.digest, owner(entry.key));
  }
  gc() {
    return this.blobs.gc();
  }
  expired(entry: CacheEntry, now: Date) {
    return now.getTime() >= new Date(entry.expiresAt).getTime();
  }

  private assertEntry(entry: CacheEntry) {
    this.assertShape(entry);
    this.assertKey(entry.key);
    this.assertTtl(this.ttl(entry));
  }
  private assertShape(entry: CacheEntry) {
    if (
      entry.kind !== "yafs-cache-entry" ||
      entry.version !== 1 ||
      !entry.digest ||
      !entry.createdAt ||
      !entry.expiresAt
    ) {
      throw new Error("Invalid cache entry");
    }
  }
  private ttl(entry: CacheEntry) {
    return (
      new Date(entry.expiresAt).getTime() - new Date(entry.createdAt).getTime()
    );
  }

  private assertKey(key: string) {
    if (!key || key.length > 512 || key.includes("\0")) {
      throw new Error("Invalid cache key");
    }
  }
  private assertTtl(ttlMs: number) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 31_536_000_000) {
      throw new Error("Invalid cache TTL");
    }
  }
  private assertSize(bytes: number) {
    if (bytes > maxValueBytes) {
      throw new Error(`Cache value exceeds ${maxValueBytes} bytes`);
    }
  }
}

function owner(key: string) {
  return `cache:${key}`;
}
