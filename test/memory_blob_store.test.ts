import { expect, test } from "bun:test";

import { memoryBlobStore } from "../src/protocol/MemoryBlobStore";

test("an in-memory blob store deduplicates and collects unretained bytes", async () => {
  const store = memoryBlobStore();
  const bytes = new TextEncoder().encode("memory");
  const digest = await store.put(bytes);
  expect(await store.put(bytes)).toBe(digest);
  expect(await store.get(digest)).toEqual(bytes);
  expect((await store.gc()).reclaimed).toEqual([digest]);
});

test("an in-memory blob store holds bytes for each retaining owner", async () => {
  const store = memoryBlobStore();
  const digest = await store.put(new TextEncoder().encode("held"));
  store.retain(digest, "one");
  store.retain(digest, "two");
  store.release(digest, "one");
  expect((await store.gc()).reclaimed).toEqual([]);
  store.release(digest, "two");
  expect((await store.gc()).reclaimed).toEqual([digest]);
});
