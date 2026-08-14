import { expect, test } from "bun:test";

import { ignoreMissing } from "../src/DaemonStateIO";

test("ignoreMissing rethrows any error that is not ENOENT", async () => {
  const error = Object.assign(new Error("denied"), { code: "EACCES" });
  await expect(ignoreMissing(() => Promise.reject(error))).rejects.toThrow(
    "denied",
  );
});

test("ignoreMissing swallows an ENOENT error", async () => {
  const error = Object.assign(new Error("gone"), { code: "ENOENT" });
  await expect(
    ignoreMissing(() => Promise.reject(error)),
  ).resolves.toBeUndefined();
});
