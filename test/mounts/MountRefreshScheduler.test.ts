import { expect, test } from "bun:test";

import { MountRefreshScheduler } from "../../src/mounts/MountRefreshScheduler";
import { PreparedMountRecord } from "../../src/mounts/types";

test("scheduler refreshes only due mounts and coalesces an in-flight attempt", async () => {
  const record = mount();
  let calls = 0;
  let release!: () => void;
  const refresh = async () => {
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
  };
  const scheduler = new MountRefreshScheduler(
    () => [record],
    refresh,
    () => 61_000,
  );
  const first = scheduler.tick();
  await scheduler.tick();
  expect(calls).toBe(1);
  release();
  await first;
  await scheduler.tick();
  expect(calls).toBe(2);
});

test("scheduler leaves a failed mount eligible without changing its persisted freshness", async () => {
  const record = mount();
  const scheduler = new MountRefreshScheduler(
    () => [record],
    async () => {
      throw new Error("offline");
    },
    () => 61_000,
  );
  await expect(scheduler.tick()).rejects.toThrow("offline");
  expect(record.fetchedAt).toBe("1970-01-01T00:00:00.000Z");
});

test("scheduler uses its system clock when no test clock is supplied", async () => {
  let calls = 0;
  const scheduler = new MountRefreshScheduler(
    () => [mount()],
    async () => {
      calls++;
    },
  );
  await scheduler.tick();
  expect(calls).toBe(1);
});

function mount(): PreparedMountRecord {
  return {
    id: "review",
    path: "/reviews",
    provider: "github",
    config: { repository: "acme/widget" },
    manifestPath: "/.yafsmeta",
    manifestDigest: "digest",
    revision: "github:one",
    state: "active",
    activatedAt: "1970-01-01T00:00:00.000Z",
    fetchedAt: "1970-01-01T00:00:00.000Z",
    correlationId: "review:one",
    capabilities: ["network.github-api"],
    refreshIntervalMs: 60_000,
    snapshot: { entries: [], fileCount: 0, byteCount: 0 },
  };
}
