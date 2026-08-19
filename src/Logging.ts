import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { Logger } from "tslog";

export type Log = Logger<object>;

const MASKED_KEYS = ["password", "apiKey", "token", "authorization", "prompt"];

export function createLogger(dataDir = ".yafs"): Log {
  const testing = process.env.NODE_ENV === "test";
  const log = new Logger<object>({
    type: testing ? "hidden" : "pretty",
    mask: { keys: MASKED_KEYS, caseInsensitive: true },
  });
  attachJsonFile(log, jsonLogPath(dataDir, testing));
  return log;
}

function jsonLogPath(dataDir: string, testing: boolean): string {
  return testing ? ".yafs-test/test.jsonl" : `${dataDir}/daemon.jsonl`;
}

type WriteFile = (path: string, content: string) => Promise<unknown>;

export function attachJsonFile(
  log: Log,
  path: string,
  write: WriteFile = appendFile,
) {
  mkdirSync(dirname(path), { recursive: true });
  log.attachTransport(jsonFileTransport(write, path));
}

function jsonFileTransport(write: WriteFile, path: string) {
  return {
    name: "jsonFile",
    format: "json" as const,
    write: (_record: unknown, line: string) => {
      appended(write, path, line);
    },
  };
}

function appended(write: WriteFile, path: string, line: string) {
  void write(path, `${line}\n`).catch(() => undefined);
}

export const log = createLogger(process.env.YAFS_DATA_DIR ?? ".yafs");
