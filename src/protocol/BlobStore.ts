import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  sha256,
  assertDigest,
  assertMissing,
  validDigest,
  validShard,
  missing,
} from "./BlobDigest";
import { writeBlob } from "./BlobWrite";

export interface BlobStore {
  put(bytes: Uint8Array): Promise<string>;
  get(digest: string): Promise<Uint8Array | undefined>;
  retain(digest: string, ownerId: string): void;
  release(digest: string, ownerId: string): void;
  gc(): Promise<{ reclaimed: string[] }>;
}

export function openBlobStore(_directory: string): BlobStore {
  return new LocalBlobStore(_directory);
}

class LocalBlobStore implements BlobStore {
  private readonly owners = new Map<string, Set<string>>();

  constructor(private readonly directory: string) {}

  async put(bytes: Uint8Array) {
    const digest = sha256(bytes);
    const path = this.path(digest);
    if (!(await this.exists(path))) {
      await writeBlob(this.directory, path, bytes);
    }
    return digest;
  }

  private async exists(path: string) {
    return readFile(path)
      .then(() => true)
      .catch((error: unknown) => assertMissing(error));
  }
  async get(digest: string) {
    try {
      return await readFile(this.path(digest));
    } catch (error) {
      if (missing(error)) {
        return undefined;
      }
      throw error;
    }
  }
  retain(digest: string, ownerId: string) {
    this.ownerSet(digest).add(ownerId);
  }
  release(digest: string, ownerId: string) {
    this.owners.get(digest)?.delete(ownerId);
  }
  async gc() {
    const reclaimed = await this.digests();
    await Promise.all(reclaimed.map((digest) => unlink(this.path(digest))));
    return { reclaimed };
  }

  private path(digest: string) {
    assertDigest(digest);
    return join(this.directory, digest.slice(0, 2), digest);
  }
  private ownerSet(digest: string) {
    assertDigest(digest);
    return this.owners.get(digest) ?? this.addOwners(digest);
  }
  private addOwners(digest: string) {
    const owners = new Set<string>();
    this.owners.set(digest, owners);
    return owners;
  }
  private async digests() {
    return (await this.files()).filter(
      (digest) => !this.owners.get(digest)?.size,
    );
  }
  private async files() {
    return (
      await Promise.all((await this.shards()).map((shard) => this.shard(shard)))
    ).flat();
  }
  private async shards() {
    try {
      return (await readdir(this.directory)).filter(validShard);
    } catch (error) {
      if (missing(error)) {
        return [];
      }
      throw error;
    }
  }
  private async shard(name: string) {
    return (await readdir(join(this.directory, name))).filter(validDigest);
  }
}
