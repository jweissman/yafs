import { expect, test } from "bun:test";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { openBlobStore } from "../src/protocol/BlobStore";

test("put stores content, addressed by its own digest, and get round-trips it exactly", async () => {
  const store = openBlobStore(await directory());
  const bytes = new TextEncoder().encode("hello blob");
  const digest = await store.put(bytes);
  expect(digest).toBe(sha256(bytes));
  expect(await store.get(digest)).toEqual(bytes);
});

test("putting identical content twice is a no-op that returns the same digest", async () => {
  const store = openBlobStore(await directory());
  const bytes = new TextEncoder().encode("same content");
  expect(await store.put(bytes)).toBe(await store.put(bytes));
});

test("get on an unknown digest returns undefined, not an error", async () => {
  const store = openBlobStore(await directory());
  expect(
    await store.get(sha256(new TextEncoder().encode("never stored"))),
  ).toBeUndefined();
});

test("a malformed digest is rejected before it becomes a path", async () => {
  const store = openBlobStore(await directory());
  await expect(store.get("../../etc/passwd")).rejects.toThrow();
  await expect(store.get("not-hex-at-all")).rejects.toThrow();
});

test("gc reclaims a blob with zero retaining owners", async () => {
  const store = openBlobStore(await directory());
  const digest = await store.put(new TextEncoder().encode("orphaned"));
  expect((await store.gc()).reclaimed).toEqual([digest]);
  expect(await store.get(digest)).toBeUndefined();
});

test("gc does not reclaim a blob an active owner still retains", async () => {
  const store = openBlobStore(await directory());
  const digest = await store.put(new TextEncoder().encode("held"));
  store.retain(digest, "trace:1");
  expect((await store.gc()).reclaimed).toEqual([]);
  expect(await store.get(digest)).toBeDefined();
});

test("a blob survives until every retaining owner releases it", async () => {
  const store = openBlobStore(await directory());
  const digest = await store.put(new TextEncoder().encode("shared"));
  store.retain(digest, "trace:1");
  store.retain(digest, "trace:2");
  store.release(digest, "trace:1");
  expect((await store.gc()).reclaimed).toEqual([]);
  store.release(digest, "trace:2");
  expect((await store.gc()).reclaimed).toEqual([digest]);
});

test("a fresh store has retained nothing yet, so gc reclaims everything until callers replay their retains", async () => {
  // Documents the lifecycle hazard from the design: retain/release are in-memory only and
  // start empty on construction. A caller that calls gc() before finishing its own replay-time
  // retain() calls will lose every blob it meant to keep — this is the store behaving exactly
  // as specified, not a bug, which is why the ordering is a documented caller obligation.
  const path = await directory();
  const first = openBlobStore(path);
  const digest = await first.put(
    new TextEncoder().encode("will be lost if gc runs too early"),
  );
  const second = openBlobStore(path);
  expect((await second.gc()).reclaimed).toEqual([digest]);
});

test("content survives a fresh store instance pointed at the same directory", async () => {
  const path = await directory();
  const bytes = new TextEncoder().encode("durable across restart");
  const digest = await openBlobStore(path).put(bytes);
  expect(await openBlobStore(path).get(digest)).toEqual(bytes);
});

test("concurrent puts of identical content resolve to the same digest without corruption", async () => {
  const store = openBlobStore(await directory());
  const bytes = new TextEncoder().encode("raced");
  const digests = await Promise.all([
    store.put(bytes),
    store.put(bytes),
    store.put(bytes),
  ]);
  expect(new Set(digests).size).toBe(1);
  expect(await store.get(digests[0])).toEqual(bytes);
});

test("blobs are sharded by the first two digest characters, git-style", async () => {
  const path = await directory();
  const bytes = new TextEncoder().encode("sharded");
  const digest = await openBlobStore(path).put(bytes);
  const shard = await readdir(join(path, digest.slice(0, 2)));
  expect(shard).toEqual([digest]);
});

test("gc ignores unrelated root files instead of treating them as shards", async () => {
  const path = await directory();
  await writeFile(join(path, ".DS_Store"), "");
  const store = openBlobStore(path);
  const digest = await store.put(new TextEncoder().encode("orphan"));
  expect((await store.gc()).reclaimed).toEqual([digest]);
});

async function directory() {
  return mkdtemp(join(tmpdir(), "yafs-blobs-"));
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
