import { expect, test } from "bun:test";

import { assertMissing } from "../../src/protocol/BlobDigest";

test("assertMissing rethrows any error that is not ENOENT", () => {
  const error = new Error("permission denied");
  expect(() => assertMissing(error)).toThrow("permission denied");
});

test("assertMissing returns false for an ENOENT error", () => {
  const error = Object.assign(new Error("gone"), { code: "ENOENT" });
  expect(assertMissing(error)).toBe(false);
});
