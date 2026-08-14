import { expect, test } from "bun:test";
import { mkdtemp, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitGrowth, printLogs } from "../src/DaemonLogs";

// --tail's `follow()` loop is a genuinely foreground, run-until-Ctrl-C CLI
// behavior with no cancellation hook (by design, matching this repo's
// precedent for interactive/long-running CLI surfaces — see
// docs/AGENT-CHAT-VALIDATION.md's note that agent chat's REPL is validated
// via its runbook, not an automated test). Manually verified: `yafsd logs
// --tail` picks up content appended to the log file after it starts
// watching. `emitGrowth` — the part of that loop that actually decides
// what to (re-)read — is exported and tested directly below instead.

test("printLogs prints the last N lines by default and with -n", async () => {
  const path = await logFile("a\nb\nc\nd\ne\n");
  expect(await captured(() => printLogs(path, ["-n", "2"]))).toBe("d\ne\n");
  expect(await captured(() => printLogs(path, []))).toBe("a\nb\nc\nd\ne\n");
});

test("printLogs on a missing log file prints nothing instead of throwing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yafs-logs-missing-"));
  const path = join(dir, "daemon.log");
  expect(await captured(() => printLogs(path, []))).toBe("");
});

test("emitGrowth writes only the newly appended bytes and advances position", async () => {
  const path = await logFile("start\n");
  await writeFile(path, "start\nmore\n");
  let position = 0;
  const output = await captured(async () => {
    position = await emitGrowth(path, "start\n".length);
  });
  expect(output).toBe("more\n");
  expect(position).toBe("start\nmore\n".length);
});

test("emitGrowth is a no-op when the file hasn't grown", async () => {
  const path = await logFile("start\n");
  const size = "start\n".length;
  let position = -1;
  const output = await captured(async () => {
    position = await emitGrowth(path, size);
  });
  expect(output).toBe("");
  expect(position).toBe(size);
});

test("emitGrowth resets to the start when the file was truncated (rotated)", async () => {
  const path = await logFile("a long line that will be truncated\n");
  await truncate(path, 3);
  expect(await emitGrowth(path, 100)).toBe(0);
});

test("emitGrowth treats a log file that disappeared mid-tail as size zero", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yafs-logs-gone-"));
  const path = join(dir, "daemon.log");
  expect(await emitGrowth(path, 5)).toBe(0);
});

test("printLogs --tail follows appended content until aborted", async () => {
  const path = await logFile("start\n");
  const controller = new AbortController();
  const output = await captured(async () => {
    const run = printLogs(path, ["--tail"], controller.signal);
    await writeFile(path, "start\nappended\n");
    setTimeout(() => controller.abort(), 350);
    await run;
  });
  expect(output).toContain("appended\n");
});

async function logFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "yafs-logs-"));
  const path = join(dir, "daemon.log");
  await writeFile(path, content);
  return path;
}

async function captured(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}
