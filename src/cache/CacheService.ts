import { BlobStore } from "../protocol/BlobStore";
import { assertEntry, assertKey, assertSize, assertTtl } from "./CacheValidation";

export type CacheEntry = {
  kind: "yafs-cache-entry";
  version: 1;
  key: string;
  digest: string;
  createdAt: string;
  expiresAt: string;
  bytes: number;
};
type PutRequest = { key: string; ttlMs: number; now: Date };

export class CacheService {
  constructor(private readonly blobs: BlobStore) {}

  async create(
    key: string,
    content: string,
    ttlMs: number,
    now: Date,
  ): Promise<CacheEntry> {
    assertKey(key);
    assertTtl(ttlMs);
    return this.created({ key, ttlMs, now }, content);
  }

  private async created(
    request: PutRequest,
    content: string,
  ): Promise<CacheEntry> {
    const bytes = new TextEncoder().encode(content);
    assertSize(bytes.byteLength);
    const digest = await this.blobs.put(bytes);
    return this.metadata({ ...request, digest, bytes: bytes.byteLength });
  }

  private metadata(
    stored: PutRequest & { digest: string; bytes: number },
  ): CacheEntry {
    const { key, ttlMs, now, digest, bytes } = stored;
    return {
      ...this.identity(key, digest, bytes),
      ...this.lifespan(now, ttlMs),
    };
  }

  private identity(key: string, digest: string, bytes: number) {
    return {
      kind: "yafs-cache-entry" as const,
      version: 1 as const,
      key,
      digest,
      bytes,
    };
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
    assertEntry(entry);
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
}

function owner(key: string) {
  return `cache:${key}`;
}
