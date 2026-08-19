import { expect, test } from "bun:test";

import { combinedCiStatus } from "../../../src/plugins/github/GitHubCiStatus";

test("combinedCiStatus reports none for a commit with no check runs", () => {
  expect(combinedCiStatus([])).toBe("none");
});

test("combinedCiStatus reports failure if any run failed", () => {
  const runs = [
    { status: "completed", conclusion: "success" },
    { status: "completed", conclusion: "failure" },
  ];
  expect(combinedCiStatus(runs)).toBe("failure");
});

test("combinedCiStatus reports pending if nothing failed but a run is unfinished", () => {
  const runs = [
    { status: "completed", conclusion: "success" },
    { status: "in_progress", conclusion: null },
  ];
  expect(combinedCiStatus(runs)).toBe("pending");
});

test("combinedCiStatus reports success once every run has completed cleanly", () => {
  const runs = [
    { status: "completed", conclusion: "success" },
    { status: "completed", conclusion: "skipped" },
  ];
  expect(combinedCiStatus(runs)).toBe("success");
});
