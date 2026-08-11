import { expect, test } from "bun:test";

import { startupError } from "../src/DaemonStartupError";

test("startup diagnostics ignore an earlier daemon error", () => {
  const old = "error: old provider failure\n";
  const current = "error: WAL lock is held by live PID 42\n";
  expect(startupError(`${old}${current}`, old.length)).toBe(
    "yafsd failed to start: WAL lock is held by live PID 42",
  );
});
