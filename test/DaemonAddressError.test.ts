import { expect, test } from "bun:test";

import { addressInUseError, isAddressInUse } from "../src/DaemonAddressError";

test("isAddressInUse recognizes an EADDRINUSE error", () => {
  const error = Object.assign(new Error("bind failed"), {
    code: "EADDRINUSE",
  });
  expect(isAddressInUse(error)).toBe(true);
});

test("isAddressInUse rejects other errors, and non-error values", () => {
  expect(isAddressInUse(new Error("boom"))).toBe(false);
  expect(isAddressInUse(Object.assign(new Error(), { code: "ENOENT" }))).toBe(
    false,
  );
  expect(isAddressInUse(undefined)).toBe(false);
  expect(isAddressInUse("not an object")).toBe(false);
});

test("addressInUseError names the host and port", () => {
  expect(addressInUseError("127.0.0.1", 7337).message).toContain(
    "127.0.0.1:7337",
  );
});
