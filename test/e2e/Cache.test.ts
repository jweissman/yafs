import { expect, test } from "bun:test";

import Yafs from "../../src/index";
import { Clock } from "../../src/core/Clock";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YafsServer } from "../../src/protocol/server";
import { YashClient } from "../../src/protocol/client";

test("cache stores UTF-8 values in blobs with visible TTL metadata", async () => {
  const yafs = new Yafs({ clock: clock("2026-08-05T12:00:00.000Z") });
  expect(
    (await yafs.executeAsync("cache put --ttl 5m greeting hello")).stdout,
  ).toBe("");
  expect((await yafs.executeAsync("cache get greeting")).stdout).toBe("hello");
  expect(
    JSON.parse((await yafs.executeAsync("cache stat greeting")).stdout),
  ).toMatchObject({ key: "greeting" });
  expect(yafs.exec("cat cache/metadata/greeting.json")).toContain('"digest"');
});

test("cache put without --ttl is rejected", async () => {
  const yafs = new Yafs();
  expect((await yafs.executeAsync("cache put greeting hello")).stderr).toBe(
    "cache put requires --ttl DURATION",
  );
});

test("cache expiry hides an entry and explicit collection reclaims its blob", async () => {
  const now = clock("2026-08-05T12:00:00.000Z");
  const yafs = new Yafs({ clock: now });
  await yafs.executeAsync("cache put --ttl 1s brief value");
  now.set("2026-08-05T12:00:01.000Z");
  expect((await yafs.executeAsync("cache get brief")).stderr).toContain(
    "Cache miss: brief",
  );
  expect(
    JSON.parse((await yafs.executeAsync("cache gc")).stdout).reclaimed,
  ).toHaveLength(1);
});

test("cache replacement and deletion release prior values without exposing a stale entry", async () => {
  const yafs = new Yafs();
  await yafs.executeAsync("cache put --ttl 5m key first");
  await yafs.executeAsync("cache put --ttl 5m key second");
  expect((await yafs.executeAsync("cache get key")).stdout).toBe("second");
  expect(
    JSON.parse((await yafs.executeAsync("cache gc")).stdout).reclaimed,
  ).toHaveLength(1);
  await yafs.executeAsync("cache delete key");
  expect(
    JSON.parse((await yafs.executeAsync("cache gc")).stdout).reclaimed,
  ).toHaveLength(1);
});

test("cache rejects malformed TTLs and values larger than its bounded local contract", async () => {
  const yafs = new Yafs();
  const value = "x".repeat(1_048_577);
  expect(
    (await yafs.executeAsync("cache put --ttl tomorrow key value")).stderr,
  ).toContain("Invalid cache TTL");
  expect(
    (await yafs.executeAsync(`cache put --ttl 1s large ${value}`)).stderr,
  ).toContain("Cache value exceeds");
});

test("cache rejects an unrecognized subcommand", async () => {
  const yafs = new Yafs();
  expect((await yafs.executeAsync("cache bogus")).stderr).toBe(
    "cache expects put, get, stat, delete, or gc",
  );
});

test("a restarted daemon retains an active cache blob from journaled metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-cache-restart-"));
  const first = await YafsServer.start({ dataDir: directory });
  const client = await YashClient.connect(first.address());
  await client.exec("cache put --ttl 5m durable value");
  await client.close();
  await first.close();
  const second = await YafsServer.start({ dataDir: directory });
  const restored = await YashClient.connect(second.address());
  expect(await restored.exec("cache get durable")).toBe("value");
  expect(JSON.parse(await restored.exec("cache gc")).reclaimed).toEqual([]);
  await restored.close();
  await second.close();
});

test("the local protocol exposes typed cache operations without shell quoting", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-cache-rpc-")),
  });
  const client = await YashClient.connect(server.address());
  const key = "review-42";
  const value = '"quoted" $ text';
  expect((await client.cachePut(key, value, 3_600_000)).error).toBeUndefined();
  expect(await client.exec("ls cache/metadata")).toBe("review-42.json");
  expect(JSON.parse((await client.cacheStat(key)).stdout).state).toBe("active");
  expect((await client.cacheGet(key)).stdout).toBe(value);
  expect(JSON.parse((await client.cacheGc()).stdout).reclaimed).toEqual([]);
  expect(JSON.parse((await client.cacheStat(key)).stdout)).toMatchObject({
    key,
    state: "active",
  });
  await client.cacheDelete(key);
  expect((await client.cacheGet(key)).error?.message).toContain("Cache miss");
  await client.close();
  await server.close();
});

test("concurrent cache replacements serialize without retaining a stale value", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-cache-concurrent-")),
  });
  const first = await YashClient.connect(server.address());
  const second = await YashClient.connect(server.address());
  await Promise.all([
    first.cachePut("shared", "first", 3_600_000),
    second.cachePut("shared", "second", 3_600_000),
  ]);
  expect(["first", "second"]).toContain(
    (await first.cacheGet("shared")).stdout,
  );
  expect(JSON.parse((await first.cacheGc()).stdout).reclaimed).toHaveLength(1);
  await first.close();
  await second.close();
  await server.close();
});

function clock(value: string): Clock & { set(value: string): void } {
  let current = new Date(value);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}
