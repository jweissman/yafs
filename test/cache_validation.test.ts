import { expect, test } from "bun:test";

import { assertEntry, assertKey, assertTtl } from "../src/cache/CacheValidation";
import { CacheEntry } from "../src/cache/CacheService";

test("assertEntry rejects a malformed persisted cache entry", () => {
  const malformed = { kind: "wrong-kind" } as unknown as CacheEntry;
  expect(() => assertEntry(malformed)).toThrow("Invalid cache entry");
});

test("assertKey rejects an empty, oversized, or null-containing key", () => {
  expect(() => assertKey("")).toThrow("Invalid cache key");
  expect(() => assertKey("x".repeat(513))).toThrow("Invalid cache key");
  expect(() => assertKey("has\0null")).toThrow("Invalid cache key");
});

test("assertTtl rejects a non-integer, non-positive, or too-large TTL", () => {
  expect(() => assertTtl(1.5)).toThrow("Invalid cache TTL");
  expect(() => assertTtl(0)).toThrow("Invalid cache TTL");
  expect(() => assertTtl(31_536_000_001)).toThrow("Invalid cache TTL");
});
