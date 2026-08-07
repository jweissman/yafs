import { createHash } from "node:crypto";

import { BlobStore } from "./BlobStore";

export function memoryBlobStore(): BlobStore {
  return new MemoryBlobStore();
}

class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();
  private readonly owners = new Map<string, Set<string>>();

  constructor() {}

  async put(bytes: Uint8Array) {
    const digest = sha256(bytes);
    if (!this.blobs.has(digest)) {
      this.blobs.set(digest, bytes);
    }
    return digest;
  }
  async get(digest: string) {
    return this.blobs.get(digest);
  }
  retain(digest: string, owner: string) {
    this.ownersFor(digest).add(owner);
  }
  release(digest: string, owner: string) {
    this.owners.get(digest)?.delete(owner);
  }
  async gc() {
    const reclaimed = [...this.blobs.keys()].filter(
      (digest) => !this.owners.get(digest)?.size,
    );
    reclaimed.forEach((digest) => this.blobs.delete(digest));
    return { reclaimed };
  }
  private ownersFor(digest: string) {
    return this.owners.get(digest) || this.addOwners(digest);
  }
  private addOwners(digest: string) {
    const owners = new Set<string>();
    this.owners.set(digest, owners);
    return owners;
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
