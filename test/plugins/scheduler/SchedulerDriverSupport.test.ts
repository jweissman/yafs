import { expect, test } from "bun:test";

import {
  logResult,
  requestFor,
  unchanged,
} from "../../../src/plugins/scheduler/SchedulerDriverSupport";
import { SchedulerConfig } from "../../../src/mounts/types";
import { loggedEntries } from "../../logging_helpers";

test("requestFor bundles a scheduler config into a ScriptRequest", () => {
  const request = requestFor({
    script: "/home/root/x.yash",
    intervalMs: 1000,
    args: ["a"],
    allow: ["read"],
  });
  expect(request).toEqual({
    path: "/home/root/x.yash",
    args: ["a"],
    allow: ["read"],
  });
});

test("unchanged compares scheduler configs by value", () => {
  const config: SchedulerConfig = {
    script: "/x",
    intervalMs: 1000,
    allow: ["read"],
  };
  expect(unchanged(config, { ...config })).toBe(true);
  expect(unchanged(config, { ...config, intervalMs: 2000 })).toBe(false);
});

test("logResult logs a successful tick's output", async () => {
  const entries = await loggedEntries(async () => {
    logResult("pulse", { output: "hi there" });
  });
  expect(
    entries.some(
      (entry) =>
        entry.message === "scheduler tick" && entry.output === "hi there",
    ),
  ).toBe(true);
});

test("logResult logs a failed tick's error", async () => {
  const entries = await loggedEntries(async () => {
    logResult("pulse", { error: "boom" });
  });
  expect(
    entries.some(
      (entry) =>
        entry.message === "scheduler tick failed" && entry.error === "boom",
    ),
  ).toBe(true);
});
