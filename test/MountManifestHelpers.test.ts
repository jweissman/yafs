import { expect, test } from "bun:test";

import { auditSequences } from "./mount_manifest_helpers";

test("auditSequences rejects a record without a numeric sequence", () => {
  expect(() => auditSequences('{"sequence":"one"}')).toThrow("audit record");
});
