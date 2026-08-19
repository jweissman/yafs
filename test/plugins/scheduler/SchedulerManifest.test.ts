import { expect, test } from "bun:test";

import { schedulerConfig } from "../../../src/plugins/scheduler/SchedulerManifest";

test("schedulerConfig accepts a well-formed config", () => {
  const config = schedulerConfig({
    script: "/home/root/scripts/monitor.yash",
    intervalMs: 60000,
    args: ["one", "two"],
    allow: ["read", "mutate"],
  });
  expect(config).toEqual({
    script: "/home/root/scripts/monitor.yash",
    intervalMs: 60000,
    args: ["one", "two"],
    allow: ["read", "mutate"],
  });
});

test("schedulerConfig accepts an omitted args list", () => {
  const config = schedulerConfig({
    script: "/home/root/scripts/monitor.yash",
    intervalMs: 60000,
    allow: ["read"],
  });
  expect(config).toEqual({
    script: "/home/root/scripts/monitor.yash",
    intervalMs: 60000,
    args: undefined,
    allow: ["read"],
  });
});

test("schedulerConfig rejects an unknown field", () => {
  expect(() =>
    schedulerConfig({
      script: "/x",
      intervalMs: 1000,
      allow: ["read"],
      extra: true,
    }),
  ).toThrow("Unknown");
});

test("schedulerConfig rejects a non-object value", () => {
  expect(() => schedulerConfig("nope")).toThrow();
});

test("schedulerConfig rejects a relative script path", () => {
  expect(() =>
    schedulerConfig({
      script: "relative/path",
      intervalMs: 1000,
      allow: ["read"],
    }),
  ).toThrow("Invalid scheduler config");
});

test("schedulerConfig rejects a non-string script", () => {
  expect(() =>
    schedulerConfig({ script: 5, intervalMs: 1000, allow: ["read"] }),
  ).toThrow("Invalid scheduler config");
});

test("schedulerConfig rejects a non-positive or non-integer intervalMs", () => {
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: 0, allow: ["read"] }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: -5, allow: ["read"] }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: 1.5, allow: ["read"] }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: "1000", allow: ["read"] }),
  ).toThrow("Invalid scheduler config");
});

test("schedulerConfig rejects a non-array args, or an args entry that isn't a string", () => {
  expect(() =>
    schedulerConfig({
      script: "/x",
      intervalMs: 1000,
      args: "not-an-array",
      allow: ["read"],
    }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({
      script: "/x",
      intervalMs: 1000,
      args: [1, 2],
      allow: ["read"],
    }),
  ).toThrow("Invalid scheduler config");
});

test("schedulerConfig rejects a missing, empty, or invalid allow list", () => {
  expect(() => schedulerConfig({ script: "/x", intervalMs: 1000 })).toThrow(
    "Invalid scheduler config",
  );
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: 1000, allow: [] }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: 1000, allow: ["not-a-name"] }),
  ).toThrow("Invalid scheduler config");
  expect(() =>
    schedulerConfig({ script: "/x", intervalMs: 1000, allow: "read" }),
  ).toThrow("Invalid scheduler config");
});
