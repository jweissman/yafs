import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";

export type BlobStore = {
  put(bytes: Uint8Array): Promise<string>;
  get(digest: string): Promise<Uint8Array | undefined>;
  retain(digest: string, ownerId: string): void;
  release(digest: string, ownerId: string): void;
  gc(): Promise<{ reclaimed: string[] }>;
};

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
      await this.write(path, bytes);
    }
    return digest;
  }

  private async exists(path: string) {
    try {
      await readFile(path);
      return true;
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
      return false;
    }
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

  private async write(path: string, bytes: Uint8Array) {
    const temporary = this.temporary(path);
    await this.prepare(path);
    await this.writeTemporary(temporary, bytes);
    return this.replace(temporary, path);
  }
  private temporary(path: string) {
    return `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  }
  private prepare(path: string) {
    return mkdir(join(this.directory, path.slice(-64, -62)), {
      recursive: true,
    });
  }
  private async replace(temporary: string, path: string) {
    await rename(temporary, path);
    return syncDirectory(path);
  }
  private async writeTemporary(path: string, bytes: Uint8Array) {
    const file = await open(path, "w");
    await file.write(bytes);
    await file.sync();
    await file.close();
  }
  private path(digest: string) {
    assertDigest(digest);
    return join(this.directory, digest.slice(0, 2), digest);
  }
  private ownerSet(digest: string) {
    assertDigest(digest);
    return this.owners.get(digest) || this.addOwners(digest);
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

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
function assertDigest(digest: string) {
  if (!validDigest(digest)) {
    throw new Error("Invalid blob digest");
  }
}
function validDigest(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}
function validShard(value: string) {
  return /^[a-f0-9]{2}$/.test(value);
}
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
async function syncDirectory(path: string) {
  const file = await open(join(path, ".."), "r");
  await file.sync();
  await file.close();
}
