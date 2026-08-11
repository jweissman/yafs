import { expect, test } from "bun:test";

import { workspace } from "./workspace_helpers";

test("Yash rejects an option without a value", async () => {
  const yafs = await workspace();
  expect(() => yafs.exec("tree work --depth")).toThrow(
    "missing command argument",
  );
});

test("Yash rejects a missing positional path argument", async () => {
  const yafs = await workspace();
  expect(() => yafs.exec("tree")).toThrow("missing command argument");
});

test("Yash rejects a non-numeric --depth/--limit value", async () => {
  const yafs = await workspace();
  expect(() => yafs.exec("tree work --depth abc")).toThrow(
    "option must be a number",
  );
});

test("Yash rejects an unrecognized --type value", async () => {
  const yafs = await workspace();
  expect(() => yafs.exec("find work --type bogus")).toThrow(
    "type must be file, directory, or symlink",
  );
});
