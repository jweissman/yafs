import { expect, test } from "bun:test";

import { inspectedOrigin } from "./inspection_helpers";

test("inspectedOrigin rejects absent and malformed origin records", () => {
  expect(() => inspectedOrigin('{"origins":[]}')).toThrow(
    "at least one origin",
  );
  expect(() => inspectedOrigin('{"origins":[1]}')).toThrow("origin object");
});

test("inspectedOrigin drops fields that are absent or not strings", () => {
  const origin = inspectedOrigin(
    '{"origins":[{"kind":"github-pr","revision":42}]}',
  );
  expect(origin).toEqual({ kind: "github-pr" });
});
