import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { attachJsonFile, createLogger } from "../src/Logging";
import { Logger } from "tslog";

interface ParsedEntry {
  message: string;
  level: string;
  marker?: string;
  user?: { name: string; password: string };
  _logMeta: { runtime: string; name?: string };
}

async function loggedLine(
  marker: string,
  log: ReturnType<typeof createLogger>,
): Promise<ParsedEntry> {
  log.info({ marker }, "logging test entry");
  return findLogged(marker);
}

async function findLogged(marker: string): Promise<ParsedEntry> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const content = await readFile(".yafs-test/test.jsonl", "utf8");
  const line = content
    .trim()
    .split("\n")
    .findLast((entry) => entry.includes(marker));
  if (!line) {
    throw new Error(`No logged line found for marker ${marker}`);
  }
  return JSON.parse(line) as ParsedEntry;
}

test("createLogger writes real structured JSON, not just pretty console text", async () => {
  const marker = randomUUID();
  const log = createLogger(".yafs-unused-in-test-mode");

  const entry = await loggedLine(marker, log);

  expect(entry.message).toBe("logging test entry");
  expect(entry.level).toBe("INFO");
  expect(entry.marker).toBe(marker);
  expect(entry._logMeta.runtime).toBe("bun");
});

test("createLogger masks secret-shaped keys, including nested ones", async () => {
  const marker = randomUUID();
  const log = createLogger(".yafs-unused-in-test-mode");

  log.info(
    { marker, user: { name: "Ada", password: "hunter2" } },
    "auth event",
  );
  const entry = await findLogged(marker);

  expect(entry.user?.name).toBe("Ada");
  expect(entry.user?.password).toBe("[***]");
});

test("createLogger supports named sub-loggers for per-subsystem context", async () => {
  const marker = randomUUID();
  const log = createLogger(".yafs-unused-in-test-mode");
  const sub = log.getSubLogger({ name: "scheduler" });

  const entry = await loggedLine(marker, sub);

  expect(entry._logMeta.name).toBe("scheduler");
});

test("a failing file write is swallowed, not thrown, so logging never crashes the app", async () => {
  const log = new Logger<object>({ type: "hidden" });
  const failingWrite = () => Promise.reject(new Error("disk full"));

  attachJsonFile(log, "/tmp/yafs-logging-unused.jsonl", failingWrite);

  expect(() => log.info("this must not throw")).not.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 20));
});
