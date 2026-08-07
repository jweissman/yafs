import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearState,
  currentState,
  isRunning,
  paths,
  readState,
  writeState,
} from "../src/daemon";
import {
  configArgument,
  restartConfig,
  selectedConfig,
} from "../src/DaemonConfig";

test("daemon configuration selects explicit values and reuses saved state", () => {
  expect(configArgument("/etc/yafs/plugins.yaml")).toEqual([
    "--config",
    "/etc/yafs/plugins.yaml",
  ]);
  expect(
    selectedConfig(["bun", "yafsd", "--config", "plugins.yaml"], {}),
  ).toEndWith("/plugins.yaml");
  expect(
    restartConfig(undefined, { configPath: "/etc/yafs/plugins.yaml" }),
  ).toBe("/etc/yafs/plugins.yaml");
});

test("daemon state helpers validate, replace, and remove state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-daemon-state-"));
  const statePath = paths(directory).state;
  expect(await readState(statePath)).toBeUndefined();
  const state = await writeState(
    statePath,
    { host: "127.0.0.1", port: 7337 },
    "/etc/yafs/plugins.yaml",
  );
  expect(await currentState(statePath)).toEqual(state);
  expect(state.configPath).toBe("/etc/yafs/plugins.yaml");
  await clearState(statePath);
  expect(await readState(statePath)).toBeUndefined();
  await writeFile(statePath, "{invalid");
  await expect(readState(statePath)).rejects.toThrow();
  await writeFile(statePath, JSON.stringify({ version: 2 }));
  await expect(readState(statePath)).rejects.toThrow("Invalid daemon state");
});

test("an older daemon cannot remove its successor state", async () => {
  const state = paths(
    await mkdtemp(join(tmpdir(), "yafs-daemon-state-")),
  ).state;
  const first = await writeState(state, { host: "127.0.0.1", port: 7337 });
  const second = await writeState(state, { host: "127.0.0.1", port: 7338 });
  await clearState(state, first.instanceId);
  expect((await currentState(state))?.instanceId).toBe(second.instanceId);
});

test("daemon state removes a stale process record", async () => {
  const statePath = paths(
    await mkdtemp(join(tmpdir(), "yafs-daemon-stale-")),
  ).state;
  await writeFile(
    statePath,
    JSON.stringify({
      version: 1,
      pid: 999999,
      host: "127.0.0.1",
      port: 7337,
      startedAt: "2026-01-01T00:00:00.000Z",
      instanceId: "stale",
    }),
  );
  expect(isRunning(999999)).toBe(false);
  expect(await currentState(statePath)).toBeUndefined();
});
