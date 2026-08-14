import { expect, test } from "bun:test";

import { validate } from "../src/DaemonStateValidation";

test("validate rejects a non-object value before checking its shape", () => {
  expect(() => validate(null)).toThrow("Invalid daemon state");
  expect(() => validate("not an object")).toThrow("Invalid daemon state");
});
